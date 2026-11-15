import * as THREE from 'three';
import {
  BotController,
  BotRole,
  PlayerVisionInfo,
  TeamOrdersContext
} from './BotController';
import { SniperPerch, TacticalMapProfile, TacticalZone } from './MapTacticalAnalyzer';
import { NemesisCounterAdvice } from './PersistentNemesisAI';

export type StrategicMistake =
  | 'wrong_site_stack'
  | 'slow_rotation'
  | 'carrier_isolated'
  | 'choke_wipe';

export interface CommanderChatEvent {
  senderName: string;
  senderTeam: 'gang' | 'swat';
  textAr: string;
  textEn: string;
  isOrder: boolean;
}

export interface RoundPlanResult {
  targetSite: 'site_a' | 'site_b';
  commanderName: string;
  roles: Map<string, BotRole>;
  orders: Map<string, TeamOrdersContext>;
  chatMessage: CommanderChatEvent | null;
}

export function updateBotSelfLearning(
  bot: BotController,
  mapProfile: TacticalMapProfile,
  teamWonRound: boolean,
  roundReason: string
): void {
  const sl = bot.selfLearning;

  if (!bot.state.isAlive) {
    const deathZone = mapProfile.classifyPositionZone(bot.position);
    sl.zoneDeaths[deathZone] = (sl.zoneDeaths[deathZone] || 0) + 1;

    // Early round death with zero impact -> play smarter & use more caution early
    if (bot.roundAliveSeconds < 24 && bot.roundKills === 0) {
      sl.earlyDeaths++;
      sl.cautionBias = Math.min(0.4, sl.cautionBias + 0.08);
    }

    // Caught reloading in the open -> seek physical cover before reloading
    if (bot.diedWhileReloading) {
      sl.openReloadDeaths++;
      sl.coverReloadUrgency = Math.min(1.0, sl.coverReloadUrgency + 0.2);
    }

    // Killed or heavily damaged by HE grenade -> dodge incoming nades faster
    if (bot.lastDamageWasHE) {
      sl.grenadeDeaths++;
      sl.grenadeDodgeUrgency = Math.min(1.0, sl.grenadeDodgeUrgency + 0.22);
    }

    // Killed on long sightline (sniper lane) -> avoid solo peeking same zone
    if (bot.lastDamageDist > 22) {
      sl.sniperLaneDeaths++;
    }

    // Identify worst failing zone if repeatedly dying there
    const zones: TacticalZone[] = ['site_a', 'mid', 'site_b'];
    let worstZone: TacticalZone = 'mid';
    let maxD = 0;
    let minD = Infinity;
    for (const z of zones) {
      if (sl.zoneDeaths[z] > maxD) {
        maxD = sl.zoneDeaths[z];
        worstZone = z;
      }
      if (sl.zoneDeaths[z] < minD) {
        minD = sl.zoneDeaths[z];
      }
    }
    sl.avoidZone = maxD >= 2 && maxD - minD >= 2 ? worstZone : null;
  } else {
    // Alive when round lost to timer / explosion / defusal -> rotate faster next round!
    if (!teamWonRound && (roundReason.includes('وقت') || roundReason.includes('انفجرت') || roundReason.includes('إبطال'))) {
      sl.lateRotations++;
      sl.rotationUrgency = Math.min(0.35, sl.rotationUrgency + 0.08);
    }
    // Slowly decay caution if surviving & getting kills
    if (bot.roundKills > 0) {
      sl.cautionBias = Math.max(0, sl.cautionBias - 0.04);
    }
  }
}

export class TeamCommander {
  public readonly team: 'gang' | 'swat';
  private readonly mapProfile: TacticalMapProfile;

  public commanderName: string = 'Commander';
  public currentTargetSite: 'site_a' | 'site_b' = 'site_a';

  // Cross-round match intelligence
  private enemyZoneHistory: Record<TacticalZone, number> = { site_a: 0, mid: 0, site_b: 0 };
  private currentRoundEnemySightings: Record<TacticalZone, number> = { site_a: 0, mid: 0, site_b: 0 };
  private siteStats = {
    site_a: { attempts: 0, wins: 0 },
    site_b: { attempts: 0, wins: 0 }
  };
  private lastMistakes: StrategicMistake[] = [];
  private lastChosenSite: 'site_a' | 'site_b' = 'site_a';
  private currentRound: number = 1;

  // Mid-round tactical state & chat cooldowns
  private midRoundEvalTimer: number = 0;
  private pivotDoneThisRound: boolean = false;
  private clusterCallCooldown: number = 0;
  private carrierSpottedCallCooldown: number = 0;
  private backupCallCooldown: number = 0;

  constructor(team: 'gang' | 'swat', mapProfile: TacticalMapProfile) {
    this.team = team;
    this.mapProfile = mapProfile;
  }

  public resetMatch() {
    this.enemyZoneHistory = { site_a: 0, mid: 0, site_b: 0 };
    this.currentRoundEnemySightings = { site_a: 0, mid: 0, site_b: 0 };
    this.siteStats = {
      site_a: { attempts: 0, wins: 0 },
      site_b: { attempts: 0, wins: 0 }
    };
    this.lastMistakes = [];
    this.currentRound = 1;
    this.pivotDoneThisRound = false;
  }

  public recordEnemySighting(pos: THREE.Vector3) {
    const zone = this.mapProfile.classifyPositionZone(pos);
    this.currentRoundEnemySightings[zone] = (this.currentRoundEnemySightings[zone] || 0) + 1;
  }

  private pickCommanderBot(teamBots: BotController[]): BotController | null {
    if (teamBots.length === 0) return null;
    const sorted = [...teamBots].sort((a, b) => {
      const aScore = a.traits.utilityIQ + (a.traits.archetype === 'tactician' ? 0.25 : 0);
      const bScore = b.traits.utilityIQ + (b.traits.archetype === 'tactician' ? 0.25 : 0);
      return bScore - aScore;
    });
    return sorted[0];
  }

  private chooseNonRandomSite(
    roundNum: number,
    nemesisAdvice: NemesisCounterAdvice | null
  ): { site: 'site_a' | 'site_b'; reasonAr: string; reasonEn: string } {
    // Round 1 without prior history: still incorporate Nemesis persistent memory if available!
    if (roundNum === 1 && nemesisAdvice && nemesisAdvice.roundsObserved >= 1) {
      if (this.team === 'gang' && nemesisAdvice.avoidPlayerZone) {
        const target = nemesisAdvice.avoidPlayerZone === 'site_a' ? 'site_b' : 'site_a';
        return {
          site: target,
          reasonAr: `تحليل الخصم يظهر تمركزه في ${nemesisAdvice.avoidPlayerZone === 'site_a' ? 'A' : 'B'}، سنتجه إلى ${target === 'site_a' ? 'A' : 'B'}`,
          reasonEn: `Intel shows heavy presence at ${nemesisAdvice.avoidPlayerZone === 'site_a' ? 'A' : 'B'}, hitting ${target === 'site_a' ? 'A' : 'B'}`
        };
      }
      if (this.team === 'swat' && (nemesisAdvice.predictedPlayerZone === 'site_a' || nemesisAdvice.predictedPlayerZone === 'site_b')) {
        const target = nemesisAdvice.predictedPlayerZone;
        return {
          site: target,
          reasonAr: `توقع هجوم العدو على ${target === 'site_a' ? 'A' : 'B'} بناءً على أسلوبه المعتاد`,
          reasonEn: `Expecting enemy push toward ${target === 'site_a' ? 'A' : 'B'} from prior patterns`
        };
      }
    }

    const histA = this.enemyZoneHistory.site_a;
    const histB = this.enemyZoneHistory.site_b;

    if (this.team === 'gang') {
      // Score A vs B: avoid enemy stack, favor site with better win rate, avoid recent wipe
      let scoreA = 0;
      let scoreB = 0;

      // Avoid where SWAT usually gathers
      scoreA -= histA * 0.8;
      scoreB -= histB * 0.8;

      // Persistent Nemesis insight against SWAT player
      if (nemesisAdvice?.avoidPlayerZone === 'site_a') scoreA -= 2.2;
      if (nemesisAdvice?.avoidPlayerZone === 'site_b') scoreB -= 2.2;

      // Cross-round success rate
      const rateA = this.siteStats.site_a.attempts > 0 ? this.siteStats.site_a.wins / this.siteStats.site_a.attempts : 0.5;
      const rateB = this.siteStats.site_b.attempts > 0 ? this.siteStats.site_b.wins / this.siteStats.site_b.attempts : 0.5;
      scoreA += rateA * 2.0;
      scoreB += rateB * 2.0;

      // Avoid repeating the site if we suffered a choke wipe or wrong stack last round
      if (this.lastMistakes.includes('choke_wipe')) {
        if (this.lastChosenSite === 'site_a') scoreA -= 2.8;
        else scoreB -= 2.8;
      }

      // Slight variety tiebreaker so bots don't get stale
      if (Math.abs(scoreA - scoreB) < 0.35) {
        const flip = this.lastChosenSite === 'site_a' ? 'site_b' : 'site_a';
        return {
          site: flip,
          reasonAr: `تغيير تكتيكي للمسار نحو الموقع ${flip === 'site_a' ? 'A' : 'B'} لإرباك دفاع الشرطة`,
          reasonEn: `Switching tempo toward Site ${flip === 'site_a' ? 'A' : 'B'} to keep defense guessing`
        };
      }

      const site = scoreA >= scoreB ? 'site_a' : 'site_b';
      const siteChar = site === 'site_a' ? 'A' : 'B';
      const enemyHeavyChar = site === 'site_a' ? 'B' : 'A';
      return {
        site,
        reasonAr:
          histA + histB > 0.5
            ? `الشرطة تتجمع غالباً عند ${enemyHeavyChar}، الخطة: هجوم منظم على ${siteChar}`
            : `الاندفاع الجماعي نحو الموقع ${siteChar}`,
        reasonEn:
          histA + histB > 0.5
            ? `Enemy tends to stack ${enemyHeavyChar}, executing coordinated push on ${siteChar}`
            : `Executing coordinated strike on Site ${siteChar}`
      };
    }

    // SWAT Commander: prioritize where Gang gathers/attacks most!
    let threatA = histA;
    let threatB = histB;
    if (nemesisAdvice?.predictedPlayerZone === 'site_a') threatA += 2.0;
    if (nemesisAdvice?.predictedPlayerZone === 'site_b') threatB += 2.0;
    if (this.lastMistakes.includes('wrong_site_stack')) {
      if (this.lastChosenSite === 'site_a') threatB += 2.2;
      else threatA += 2.2;
    }

    if (threatA < 0.3 && threatB < 0.3) {
      const balanced = roundNum % 2 === 1 ? 'site_a' : 'site_b';
      return {
        site: balanced,
        reasonAr: `انتشار دفاعي متوازن مع تركيز المراقبة على ${balanced === 'site_a' ? 'A' : 'B'}`,
        reasonEn: `Balanced defensive setup with primary overwatch on ${balanced === 'site_a' ? 'A' : 'B'}`
      };
    }

    const site = threatA >= threatB ? 'site_a' : 'site_b';
    const siteChar = site === 'site_a' ? 'A' : 'B';
    return {
      site,
      reasonAr: `رصدنا تكرار هجوم العصابة على ${siteChar}، القناصون والمهاجمون غطوا ${siteChar}`,
      reasonEn: `Gang favors ${siteChar} — Snipers & Assaulters lock down ${siteChar} approaches`
    };
  }

  /**
   * Plans the round at spawn: picks non-random target zone, selects Commander,
   * assigns roles by bot traits (Gang: 1 Carrier, 2 Defenders, 2 Attackers; SWAT: 3 Attackers, 2 Snipers),
   * and generates a Team Chat order.
   */
  public planRound(
    teamBots: BotController[],
    roundNum: number,
    playerHasC4: boolean,
    playerOnThisTeam: boolean,
    nemesisAdvice: NemesisCounterAdvice | null
  ): RoundPlanResult {
    this.currentRound = roundNum;
    this.currentRoundEnemySightings = { site_a: 0, mid: 0, site_b: 0 };
    this.pivotDoneThisRound = false;
    this.midRoundEvalTimer = 0;
    this.clusterCallCooldown = 0;
    this.carrierSpottedCallCooldown = 0;
    this.backupCallCooldown = 0;

    const cmdBot = this.pickCommanderBot(teamBots);
    this.commanderName = cmdBot ? `${cmdBot.name} (القائد)` : 'Commander';

    const { site, reasonAr, reasonEn } = this.chooseNonRandomSite(roundNum, nemesisAdvice);
    this.currentTargetSite = site;
    this.lastChosenSite = site;

    const roles = new Map<string, BotRole>();
    const orders = new Map<string, TeamOrdersContext>();

    if (this.team === 'gang') {
      // GANG DIVISION: 1 Carrier + 2 Defenders + 2 Attackers (scales cleanly for 5v5..8v8!)
      const remaining = [...teamBots];
      let carrierId: string | null = playerHasC4 ? 'player' : null;

      if (!carrierId && remaining.length > 0) {
        // Pick most reliable tactician/anchor as C4 carrier
        remaining.sort(
          (a, b) =>
            b.traits.utilityIQ * 0.7 +
            b.traits.rifleSkill * 0.3 -
            (a.traits.utilityIQ * 0.7 + a.traits.rifleSkill * 0.3)
        );
        const carrierBot = remaining.shift()!;
        carrierId = carrierBot.id;
        roles.set(carrierBot.id, 'carrier');
      }

      // Total team members including player
      const totalTeam = teamBots.length + (playerOnThisTeam ? 1 : 0);
      // Target 2 Defenders in 5v5 (scales up slightly in 7v7-8v8)
      const desiredDefenders = totalTeam >= 7 ? 3 : 2;
      const numDefenders = Math.min(desiredDefenders, remaining.length);

      // Sort remaining by defense/escort suitability (utilityIQ + anchor/tactician)
      remaining.sort((a, b) => {
        const aScore = a.traits.utilityIQ + (1 - a.traits.aggression) * 0.35 + a.traits.rifleSkill * 0.3;
        const bScore = b.traits.utilityIQ + (1 - b.traits.aggression) * 0.35 + b.traits.rifleSkill * 0.3;
        return bScore - aScore;
      });

      const defenders = remaining.splice(0, numDefenders);
      for (const d of defenders) {
        roles.set(d.id, 'defender');
      }

      // Remaining bots are Attackers (distractors / flankers / entry kills)
      const attackers = remaining;
      for (const a of attackers) {
        roles.set(a.id, 'attacker');
      }

      // Assign distraction patrol nodes to Attackers (opposite site flank & mid pressure)
      const distractPool =
        site === 'site_a'
          ? [...this.mapProfile.midNodes, ...this.mapProfile.flankNodesB]
          : [...this.mapProfile.midNodes, ...this.mapProfile.flankNodesA];

      attackers.forEach((atk, i) => {
        const patrolId = distractPool.length > 0 ? distractPool[i % distractPool.length] : null;
        orders.set(atk.id, {
          targetObjective: site === 'site_a' ? 'site_b' : 'site_a',
          escortTargetId: null,
          assignedPatrolNodeId: patrolId,
          assignedSniperPerch: null,
          priorityTargetPos: null,
          priorityTargetReason: null,
          nemesisAdvice
        });
      });

      for (const def of defenders) {
        orders.set(def.id, {
          targetObjective: site,
          escortTargetId: carrierId,
          assignedPatrolNodeId: null,
          assignedSniperPerch: null,
          priorityTargetPos: null,
          priorityTargetReason: null,
          nemesisAdvice
        });
      }

      if (carrierId && carrierId !== 'player') {
        orders.set(carrierId, {
          targetObjective: site,
          escortTargetId: null,
          assignedPatrolNodeId: null,
          assignedSniperPerch: null,
          priorityTargetPos: null,
          priorityTargetReason: null,
          nemesisAdvice
        });
      }
    } else {
      // SWAT DIVISION: 3 Attackers + 2 Snipers (scales cleanly for 4..8 bots)
      const totalTeam = teamBots.length + (playerOnThisTeam ? 1 : 0);
      const desiredSnipers = totalTeam >= 7 ? 3 : totalTeam >= 4 ? 2 : 1;
      const numSnipers = Math.min(desiredSnipers, Math.max(0, teamBots.length - 1));

      // Pick Snipers strictly by highest sniperSkill (even if slow!)
      const sortedBySniper = [...teamBots].sort((a, b) => b.traits.sniperSkill - a.traits.sniperSkill);
      const snipers = sortedBySniper.slice(0, numSnipers);
      const attackers = sortedBySniper.slice(numSnipers);

      const usedPerches = new Set<string>();
      const offSite: TacticalZone = site === 'site_a' ? 'site_b' : 'site_a';

      snipers.forEach((snp, idx) => {
        roles.set(snp.id, 'sniper');
        // Sniper 0 overlooks predicted target site / mid; Sniper 1 overlooks mid or off-site!
        const watchZone: TacticalZone = idx === 0 ? site : idx === 1 ? 'mid' : offSite;
        const perch = this.mapProfile.pickSniperPerch('swat', watchZone, usedPerches);
        if (perch) usedPerches.add(perch.nodeId);

        orders.set(snp.id, {
          targetObjective: site,
          escortTargetId: null,
          assignedPatrolNodeId: perch ? perch.nodeId : null,
          assignedSniperPerch: perch,
          priorityTargetPos: null,
          priorityTargetReason: null,
          nemesisAdvice
        });
      });

      // Attackers: push/contest predicted enemy gathering zones & keep 1 watcher on off-site
      const gatherNodesPrimary =
        site === 'site_a'
          ? [...this.mapProfile.chokeNodesA, ...this.mapProfile.flankNodesA, this.mapProfile.siteANodeId]
          : [...this.mapProfile.chokeNodesB, ...this.mapProfile.flankNodesB, this.mapProfile.siteBNodeId];
      const gatherNodesMid = [...this.mapProfile.midNodes, ...this.mapProfile.chokeNodesMid];

      attackers.forEach((atk, idx) => {
        roles.set(atk.id, 'attacker');
        let assignedSite: 'site_a' | 'site_b' = site;
        let patrolId: string | null = null;

        if (idx === 0 && gatherNodesPrimary.length > 0) {
          patrolId = gatherNodesPrimary[0];
        } else if (idx === 1 && gatherNodesMid.length > 0) {
          patrolId = gatherNodesMid[0];
        } else if (idx === attackers.length - 1 && attackers.length >= 2) {
          // Keep 1 attacker watching off-site approach so team isn't blind to fakes
          assignedSite = site === 'site_a' ? 'site_b' : 'site_a';
          const offChokes = assignedSite === 'site_a' ? this.mapProfile.chokeNodesA : this.mapProfile.chokeNodesB;
          patrolId = offChokes[0] || (assignedSite === 'site_a' ? this.mapProfile.siteANodeId : this.mapProfile.siteBNodeId);
        } else if (gatherNodesPrimary.length > 0) {
          patrolId = gatherNodesPrimary[idx % gatherNodesPrimary.length];
        }

        orders.set(atk.id, {
          targetObjective: assignedSite,
          escortTargetId: null,
          assignedPatrolNodeId: patrolId,
          assignedSniperPerch: null,
          priorityTargetPos: null,
          priorityTargetReason: null,
          nemesisAdvice
        });
      });
    }

    const chatMessage: CommanderChatEvent | null = playerOnThisTeam
      ? {
          senderName: this.commanderName,
          senderTeam: this.team,
          textAr:
            this.team === 'gang'
              ? `${reasonAr} | المدافعون: احموا حامل القنبلة، المهاجمون: شتتوا الشرطة!`
              : `${reasonAr} | المهاجمون: اضغطوا على التجمع واقضوا على حامل القنبلة!`,
          textEn:
            this.team === 'gang'
              ? `${reasonEn} | Defenders: protect C4 carrier; Attackers: distract SWAT!`
              : `${reasonEn} | Assaulters: push enemy cluster & hunt C4 carrier!`,
          isOrder: true
        }
      : null;

    return {
      targetSite: site,
      commanderName: this.commanderName,
      roles,
      orders,
      chatMessage
    };
  }

  /**
   * Runs every ~0.55s mid-round to react dynamically to enemy clusters, spotted C4 carrier,
   * dropped C4 inheritance, teammate distress, and smart site pivots!
   */
  public updateMidRound(
    dt: number,
    teamBots: BotController[],
    enemyBots: BotController[],
    playerInfo: PlayerVisionInfo,
    isBombPlanted: boolean,
    bombPos: THREE.Vector3 | undefined,
    droppedBombPos: THREE.Vector3 | null,
    playerOnThisTeam: boolean,
    emitChat: (msg: CommanderChatEvent) => void
  ) {
    if (this.clusterCallCooldown > 0) this.clusterCallCooldown -= dt;
    if (this.carrierSpottedCallCooldown > 0) this.carrierSpottedCallCooldown -= dt;
    if (this.backupCallCooldown > 0) this.backupCallCooldown -= dt;

    this.midRoundEvalTimer += dt;
    if (this.midRoundEvalTimer < 0.55) return;
    this.midRoundEvalTimer = 0;

    const livingBots = teamBots.filter((b) => b.state.isAlive);
    if (livingBots.length === 0) return;

    // 1. Flexible C4 Carrier Rebalancing & Dropped C4 Recovery (Gang)
    if (this.team === 'gang' && !isBombPlanted) {
      const currentCarrierBot = livingBots.find((b) => b.state.hasC4);
      const playerCarriesC4 = playerOnThisTeam && playerInfo.isAlive && playerInfo.hasC4;
      let carrierId: string | null = currentCarrierBot ? currentCarrierBot.id : playerCarriesC4 ? 'player' : null;

      if (currentCarrierBot && currentCarrierBot.state.role !== 'carrier') {
        currentCarrierBot.state.role = 'carrier';
      }

      // If C4 is dropped on ground, ensure nearest/best living bot retrieves it and gets defended!
      if (!carrierId && droppedBombPos) {
        let closest: BotController | null = null;
        let bestD = Infinity;
        for (const b of livingBots) {
          const d = b.position.distanceTo(droppedBombPos);
          if (d < bestD) {
            bestD = d;
            closest = b;
          }
        }
        if (closest) {
          carrierId = closest.id;
          closest.state.role = 'carrier';
        }
      }

      // Ensure at least 1-2 surviving teammates act as defenders protecting the carrier
      if (carrierId) {
        const nonCarriers = livingBots.filter((b) => b.id !== carrierId);
        let defenderCount = nonCarriers.filter((b) => b.state.role === 'defender').length;
        for (const b of nonCarriers) {
          if (defenderCount < Math.min(2, nonCarriers.length) && b.state.role !== 'defender') {
            b.state.role = 'defender';
            defenderCount++;
          }
          if (b.state.role === 'defender') {
            b.escortTargetId = carrierId;
          }
        }
      }
    }

    // 2. Aggregate Live Team Vision (Spotted Enemies, C4 Carrier Sighting, Hurt Allies)
    const spottedEnemies: { pos: THREE.Vector3; hasC4: boolean; id: string }[] = [];
    const seenEnemyIds = new Set<string>();

    for (const b of livingBots) {
      if (b.targetEnemy && !seenEnemyIds.has(b.targetEnemy.id)) {
        seenEnemyIds.add(b.targetEnemy.id);
        spottedEnemies.push({
          pos: b.targetEnemy.pos,
          hasC4: Boolean(b.targetEnemy.hasC4),
          id: b.targetEnemy.id
        });
        this.recordEnemySighting(b.targetEnemy.pos);
      }
    }

    // Also include enemies clearly in human teammate's immediate spotting / gunfire if on same team
    const clusterCounts: Record<TacticalZone, { count: number; center: THREE.Vector3 }> = {
      site_a: { count: 0, center: new THREE.Vector3() },
      mid: { count: 0, center: new THREE.Vector3() },
      site_b: { count: 0, center: new THREE.Vector3() }
    };
    let spottedCarrierPos: THREE.Vector3 | null = null;

    for (const se of spottedEnemies) {
      const z = this.mapProfile.classifyPositionZone(se.pos);
      clusterCounts[z].count++;
      clusterCounts[z].center.add(se.pos);
      if (se.hasC4) {
        spottedCarrierPos = se.pos.clone();
      }
    }

    // 3. SWAT Priority: Spotted C4 Carrier Interception!
    if (this.team === 'swat' && spottedCarrierPos && !isBombPlanted) {
      const carrierZone = this.mapProfile.classifyPositionZone(spottedCarrierPos);
      const targetSite: 'site_a' | 'site_b' =
        carrierZone === 'site_b' ? 'site_b' : carrierZone === 'site_a' ? 'site_a' : this.currentTargetSite;

      for (const b of livingBots) {
        if (b.state.role === 'attacker') {
          b.applyTeamOrders({
            targetObjective: targetSite,
            priorityTargetPos: spottedCarrierPos,
            priorityTargetReason: 'carrier'
          });
        }
      }

      if (playerOnThisTeam && this.carrierSpottedCallCooldown <= 0) {
        this.carrierSpottedCallCooldown = 9.0;
        const zoneNameAr = carrierZone === 'site_a' ? 'الموقع A' : carrierZone === 'site_b' ? 'الموقع B' : 'الوسط';
        const zoneNameEn = carrierZone === 'site_a' ? 'Site A' : carrierZone === 'site_b' ? 'Site B' : 'Mid';
        emitChat({
          senderName: this.commanderName,
          senderTeam: 'swat',
          textAr: `حامل القنبلة يتجه نحو ${zoneNameAr}! اقضوا عليه فوراً!`,
          textEn: `C4 carrier spotted moving toward ${zoneNameEn}! Intercept and eliminate!`,
          isOrder: true
        });
      }
      return;
    }

    // 4. Enemy Gathering Cluster Detection (2+ enemies in one zone)
    let hotZone: TacticalZone | null = null;
    let hotCount = 0;
    for (const z of ['site_a', 'mid', 'site_b'] as TacticalZone[]) {
      if (clusterCounts[z].count >= 2 && clusterCounts[z].count > hotCount) {
        hotCount = clusterCounts[z].count;
        hotZone = z;
      }
    }

    if (hotZone) {
      const clusterCenter = clusterCounts[hotZone].center.clone().divideScalar(hotCount);
      const zoneAr = hotZone === 'site_a' ? 'A' : hotZone === 'site_b' ? 'B' : 'الوسط';
      const zoneEn = hotZone === 'site_a' ? 'Site A' : hotZone === 'site_b' ? 'Site B' : 'Mid';

      if (this.team === 'swat' && !isBombPlanted) {
        const siteHint: 'site_a' | 'site_b' =
          hotZone === 'site_b' ? 'site_b' : hotZone === 'site_a' ? 'site_a' : this.currentTargetSite;

        for (const b of livingBots) {
          if (b.state.role === 'attacker' && !b.targetEnemy) {
            b.applyTeamOrders({
              targetObjective: siteHint,
              priorityTargetPos: clusterCenter,
              priorityTargetReason: 'cluster'
            });
          }
        }

        if (playerOnThisTeam && this.clusterCallCooldown <= 0) {
          this.clusterCallCooldown = 10.0;
          emitChat({
            senderName: this.commanderName,
            senderTeam: 'swat',
            textAr: `تجمع لأفراد العصابة في ${zoneAr}! المهاجمون تقدموا للتطويق!`,
            textEn: `Enemy squad gathering at ${zoneEn}! Assaulters converging!`,
            isOrder: true
          });
        }
      } else if (
        this.team === 'gang' &&
        !isBombPlanted &&
        !this.pivotDoneThisRound &&
        (hotZone === 'site_a' || hotZone === 'site_b') &&
        hotZone === this.currentTargetSite
      ) {
        // Smart Gang Pivot: SWAT is heavily stacked on our target site — rotate to the open site!
        const carrierBot = livingBots.find((b) => b.state.hasC4);
        const carrierDistToSite = carrierBot
          ? carrierBot.position.distanceTo(
              hotZone === 'site_a' ? this.mapProfile.siteACenter : this.mapProfile.siteBCenter
            )
          : 25;

        if (carrierDistToSite > 14) {
          this.pivotDoneThisRound = true;
          const newSite: 'site_a' | 'site_b' = hotZone === 'site_a' ? 'site_b' : 'site_a';
          this.currentTargetSite = newSite;

          for (const b of livingBots) {
            if (b.state.role === 'carrier' || b.state.role === 'defender') {
              b.applyTeamOrders({ targetObjective: newSite });
            }
          }

          if (playerOnThisTeam) {
            emitChat({
              senderName: this.commanderName,
              senderTeam: 'gang',
              textAr: `الشرطة متجمعة بكثافة في ${zoneAr}! غيّروا المسار إلى الموقع ${newSite === 'site_a' ? 'A' : 'B'} فوراً!`,
              textEn: `SWAT stacked heavy on ${zoneEn}! Rotating C4 execute to Site ${newSite === 'site_a' ? 'A' : 'B'}!`,
              isOrder: true
            });
          }
        }
      }
    }

    // 5. Teammate Needs Backup (Low HP under fire or outnumbered)
    if (this.backupCallCooldown <= 0) {
      let hurtAllyName: string | null = null;
      let distressPos: THREE.Vector3 | null = null;

      if (playerOnThisTeam && playerInfo.isAlive && (playerInfo.health ?? 100) < 42) {
        hurtAllyName = 'أنت (You)';
        distressPos = playerInfo.pos.clone();
      } else {
        const hurtBot = livingBots.find((b) => b.state.health < 45 && b.isUnderFire);
        if (hurtBot) {
          hurtAllyName = hurtBot.name;
          distressPos = hurtBot.lastKnownEnemyPos
            ? hurtBot.lastKnownEnemyPos.clone()
            : hurtBot.position.clone();
        }
      }

      if (distressPos) {
        let helperDispatched = false;
        for (const b of livingBots) {
          if (!b.targetEnemy && !b.state.hasC4 && !b.state.isPlanting && !b.state.isDefusing) {
            if (b.position.distanceTo(distressPos) < 34) {
              b.applyTeamOrders({
                priorityTargetPos: distressPos,
                priorityTargetReason: 'backup'
              });
              helperDispatched = true;
              break;
            }
          }
        }
        if (helperDispatched && playerOnThisTeam && hurtAllyName) {
          this.backupCallCooldown = 11.0;
          emitChat({
            senderName: this.commanderName,
            senderTeam: this.team,
            textAr: `${hurtAllyName} يحتاج للدعم، أقرب وحدة تتجه للمساندة!`,
            textEn: `${hurtAllyName} needs backup — nearest unit moving to support!`,
            isOrder: false
          });
        }
      }
    }

    // Unused param guard (keeps enemyBots accessible for future tactical hooks)
    void enemyBots;
    void bombPos;
  }

  /**
   * Analyzes round outcome & mistakes at the end of a round to evolve team strategy.
   */
  public onRoundEnd(
    teamBots: BotController[],
    winner: 'gang' | 'swat',
    reason: string,
    plantedSite: 'A' | 'B' | null
  ) {
    const teamWon = winner === this.team;
    const decay = 0.72;

    // 1. Update exponential enemy gathering heatmap
    this.enemyZoneHistory.site_a =
      this.enemyZoneHistory.site_a * decay + Math.min(4, this.currentRoundEnemySightings.site_a * 0.45);
    this.enemyZoneHistory.mid =
      this.enemyZoneHistory.mid * decay + Math.min(4, this.currentRoundEnemySightings.mid * 0.45);
    this.enemyZoneHistory.site_b =
      this.enemyZoneHistory.site_b * decay + Math.min(4, this.currentRoundEnemySightings.site_b * 0.45);

    // 2. Track site win rate
    const evaluatedSite: 'site_a' | 'site_b' =
      plantedSite === 'B' ? 'site_b' : plantedSite === 'A' ? 'site_a' : this.currentTargetSite;
    this.siteStats[evaluatedSite].attempts++;
    if (teamWon) this.siteStats[evaluatedSite].wins++;

    // 3. Diagnose strategic team mistakes to avoid next round
    const mistakes: StrategicMistake[] = [];
    if (!teamWon) {
      if (this.team === 'swat' && plantedSite) {
        const plantedKey = plantedSite === 'B' ? 'site_b' : 'site_a';
        if (plantedKey !== this.lastChosenSite) {
          mistakes.push('wrong_site_stack');
        }
      }
      if (reason.includes('وقت') || reason.includes('انفجرت') || reason.includes('إبطال')) {
        mistakes.push('slow_rotation');
      }
      const fastDeaths = teamBots.filter((b) => !b.state.isAlive && b.roundAliveSeconds < 28);
      if (fastDeaths.length >= 2) {
        mistakes.push('choke_wipe');
      }
      if (this.team === 'gang') {
        const deadCarrier = teamBots.find((b) => b.state.role === 'carrier' && !b.state.isAlive);
        if (deadCarrier && deadCarrier.roundKills === 0) {
          mistakes.push('carrier_isolated');
        }
      }
    }
    this.lastMistakes = mistakes;

    // 4. Individual Bot Self-Learning Update
    for (const bot of teamBots) {
      updateBotSelfLearning(bot, this.mapProfile, teamWon, reason);
    }
  }
}
