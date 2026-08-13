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
  completedStep: number;
  loadingStep: number;
  dotStep: number;
  travelDuration: number;
  accepted: boolean;
  resetting: boolean;
};

const initialState: LifecycleState = {
  completedStep: -1,
  loadingStep: -1,
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
            loadingStep: 0,
            resetting: false,
          })),
        500,
      );
      schedule(
        () =>
          setLifecycle((current) => ({
            ...current,
            completedStep: 0,
            loadingStep: -1,
          })),
        1250,
      );
      schedule(
        () =>
          setLifecycle((current) => ({
            ...current,
            dotStep: 1,
            travelDuration: 1100,
          })),
        1750,
      );
      schedule(
        () => setLifecycle((current) => ({ ...current, loadingStep: 1 })),
        2450,
      );
      schedule(
        () =>
          setLifecycle((current) => ({
            ...current,
            completedStep: 1,
            loadingStep: -1,
          })),
        3650,
      );
      schedule(
        () =>
          setLifecycle((current) => ({
            ...current,
            dotStep: 2,
            travelDuration: 1900,
          })),
        4150,
      );
      schedule(
        () => setLifecycle((current) => ({ ...current, loadingStep: 2 })),
        5650,
      );
      schedule(
        () =>
          setLifecycle((current) => ({
            ...current,
            completedStep: 2,
            loadingStep: -1,
            accepted: true,
          })),
        6850,
      );
      schedule(() => setLifecycle({ ...initialState, resetting: true }), 9000);

      schedule(runCycle, 9400);
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
            className={`flow-node${index <= lifecycle.completedStep ? " active" : ""}`}
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
        <div
          className={`step${lifecycle.completedStep >= 0 ? " active" : ""}${lifecycle.loadingStep === 0 ? " loading" : ""}`}
        >
          {lifecycle.completedStep < 0 && (
            <LoaderCircle className="step-spinner" size={15} />
          )}
          <Mail size={17} />
          <span>Issued</span>
          <small>{lifecycle.completedStep >= 0 ? "now" : "pending"}</small>
        </div>
        <div
          className={`step${lifecycle.completedStep >= 1 ? " active" : ""}${lifecycle.loadingStep === 1 ? " loading" : ""}`}
        >
          {lifecycle.completedStep < 1 && (
            <LoaderCircle className="step-spinner" size={15} />
          )}
          <ShieldCheck size={17} />
          <span>Verified</span>
          <small>audience</small>
        </div>
        <div
          className={`step${lifecycle.completedStep >= 2 ? " active accepted" : ""}${lifecycle.loadingStep === 2 ? " loading" : ""}`}
        >
          {lifecycle.completedStep < 2 && (
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
