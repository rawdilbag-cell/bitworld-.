/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { BattlegroundGameEngine, GameHUDState } from './game/gameEngine';
import { TacticalHUD } from './components/TacticalHUD';

const INITIAL_HUD_STATE: GameHUDState = {
  health: 100,
  maxHealth: 100,
  shield: 100,
  maxShield: 100,
  ammo: 30,
  maxAmmo: 30,
  isReloading: false,
  weaponIndex: 0,
  weaponName: "TACTICAL PULSE RIFLE",
  isADS: false,
  isLocked: false,
  aliveCount: 26,
  totalEnemies: 25,
  playerKills: 0,
  stormPhase: 1,
  stormTimeRemaining: 45,
  isStormShrinking: false,
  isInStorm: false,
  compassHeading: 0,
  playerPos: { x: 0, y: 0, z: 0 },
  stormCenter: { x: 0, y: 0 },
  stormRadius: 1200,
  outpostPositions: [],
  botRadarPositions: [],
  killFeed: [],
  isGameOver: false,
  isVictory: false,
  gameTime: 0,
  damageDealt: 0,
};

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BattlegroundGameEngine | null>(null);
  const [hudState, setHudState] = useState<GameHUDState>(INITIAL_HUD_STATE);

  useEffect(() => {
    if (!containerRef.current) return;

    // Instantiate 3D Battleground Game Engine
    const engine = new BattlegroundGameEngine(containerRef.current, (newState) => {
      setHudState({ ...newState });
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleDeploy = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.requestPointerLock();
    }
  }, []);

  const handleRestart = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.restart();
      engineRef.current.requestPointerLock();
    }
  }, []);

  const handleSwitchWeapon = useCallback((idx: number) => {
    if (engineRef.current) {
      engineRef.current.switchWeapon(idx);
    }
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans">
      {/* 3D WebGL Canvas Container */}
      <div
        ref={containerRef}
        className="absolute inset-0 z-0 cursor-crosshair"
      />

      {/* Cinematic Tactical HUD Overlay */}
      <TacticalHUD
        hudState={hudState}
        onDeploy={handleDeploy}
        onRestart={handleRestart}
        onSwitchWeapon={handleSwitchWeapon}
      />
    </div>
  );
}
