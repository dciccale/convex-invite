"use client";

import {
  Check,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";

const DOT_POSITIONS = [16.67, 50, 83.33];

type LifecycleState = {
  activeStep: number;
  dotStep: number;
  travelDuration: number;
  accepted: boolean;
  resetting: boolean;
};

const initialState: LifecycleState = {
  activeStep: 0,
  dotStep: 0,
  travelDuration: 0,
  accepted: false,
  resetting: false,
};

export function InviteLifecycle() {
  const [lifecycle, setLifecycle] = useState(initialState);

  useEffect(() => {
    const timeouts: Array<ReturnType<typeof setTimeout>> = [];

    const schedule = (callback: () => void, delay: number) => {
      timeouts.push(setTimeout(callback, delay));
    };

    const runCycle = () => {
      schedule(
        () =>
          setLifecycle((current) => ({
            ...current,
            dotStep: 1,
            travelDuration: 1100,
            resetting: false,
          })),
        700,
      );
      schedule(
        () => setLifecycle((current) => ({ ...current, activeStep: 1 })),
        1800,
      );
      schedule(
        () =>
          setLifecycle((current) => ({
            ...current,
            dotStep: 2,
            travelDuration: 1900,
          })),
        2450,
      );
      schedule(
        () =>
          setLifecycle((current) => ({
            ...current,
            activeStep: 2,
            accepted: true,
          })),
        4350,
      );
      schedule(() => setLifecycle({ ...initialState, resetting: true }), 6800);

      schedule(runCycle, 7200);
    };

    runCycle();

    return () => {
      for (const timeout of timeouts) clearTimeout(timeout);
    };
  }, []);

  const dotStyle = {
    "--dot-position": `${DOT_POSITIONS[lifecycle.dotStep]}%`,
    "--travel-duration": `${lifecycle.travelDuration}ms`,
  } as CSSProperties;

  return (
    <div
      className="lifecycle-card"
      role="img"
      aria-label="Invitation lifecycle diagram"
    >
      <div className="lifecycle-topline">
        <span>INVITE_7Y4K</span>
        <span
          className={`live-pill${lifecycle.accepted ? " accepted" : ""}`}
          aria-live="polite"
        >
          {lifecycle.accepted ? "ACCEPTED" : "PENDING"}
        </span>
      </div>
      <div className="token-row">
        <div className="token-icon">
          <KeyRound size={20} />
        </div>
        <div>
          <span className="eyebrow">ONE-TIME TOKEN</span>
          <strong>uP4x…M9q</strong>
        </div>
        <div className="token-arrow">→</div>
        <div>
          <span className="eyebrow">DURABLE STORAGE</span>
          <strong className="hash">
            <Fingerprint size={15} /> sha256:4f2a…
          </strong>
        </div>
      </div>
      <div className="flow-line" aria-hidden="true">
        {DOT_POSITIONS.map((position, index) => (
          <span
            className={`flow-node${index <= lifecycle.activeStep ? " active" : ""}`}
            style={{ left: `${position}%` }}
            key={position}
          />
        ))}
        <span
          className={`flow-dot${lifecycle.resetting ? " resetting" : ""}${lifecycle.accepted ? " success" : ""}`}
          style={dotStyle}
        />
      </div>
      <div className="lifecycle-steps">
        <div className={`step${lifecycle.activeStep >= 0 ? " active" : ""}`}>
          <Mail size={17} />
          <span>Issued</span>
          <small>now</small>
        </div>
        <div className={`step${lifecycle.activeStep >= 1 ? " active" : ""}`}>
          {lifecycle.activeStep < 1 && (
            <LoaderCircle className="step-spinner" size={15} />
          )}
          <ShieldCheck size={17} />
          <span>Verified</span>
          <small>audience</small>
        </div>
        <div
          className={`step${lifecycle.activeStep >= 2 ? " active accepted" : ""}`}
        >
          {lifecycle.activeStep < 2 && (
            <LoaderCircle className="step-spinner" size={15} />
          )}
          {lifecycle.accepted ? (
            <span className="success-mark">
              <CheckCircle2 size={20} />
            </span>
          ) : (
            <Check size={17} />
          )}
          <span>Accepted</span>
          <small>{lifecycle.accepted ? "grant created" : "atomic grant"}</small>
        </div>
      </div>
      <div className="security-note">
        <ShieldCheck size={16} /> Raw bearer secrets never enter component
        storage.
      </div>
    </div>
  );
}
