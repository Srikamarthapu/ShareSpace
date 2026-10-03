"use client";

import { useMemo, useSyncExternalStore } from "react";

export const WORKSPACE_CONTROLS_STORAGE_KEY = "sharespace:sample:workspace-controls:v1";
const changedEvent = "sharespace:workspace-controls:changed";
const maxMembers = 2;
const maxDevices = 8;
const maxPairingRequests = 4;
const maxRotatedInvites = 4;
const inviteTokenPattern = /^[A-Za-z0-9-]{1,80}$/;
const repositoryPattern = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?$/;

export type WorkspaceRole = "admin" | "member";
export type AgentName = "Claude Code" | "Codex";
export type CapabilityState = "partial" | "unsupported";
export type InviteState = "valid" | "rotated" | "invalid" | "full";

export type SampleMember = {
  id: string;
  name: string;
  role: WorkspaceRole;
  githubLogin?: string;
};

export type SampleDevice = {
  id: string;
  memberId: string;
  memberName: string;
  name: string;
  agent: AgentName;
  status: "approved" | "revoked";
};

export type SamplePairingRequest = {
  id: string;
  memberId: string;
  memberName: string;
  agent: AgentName;
  repositoryName: string;
  status: "pending" | "approved" | "rejected";
  capabilities: {
    eventCapture: CapabilityState;
    overlapCheck: CapabilityState;
    warningDelivery: CapabilityState;
  };
};

export type WorkspaceControlsState = {
  version: 1;
  teamName: string;
  repositoryName: string;
  members: SampleMember[];
  actingMemberId: string;
  inviteToken: string;
  inviteRevision: number;
  rotatedInviteTokens: string[];
  devices: SampleDevice[];
  pairingRequests: SamplePairingRequest[];
  sharingEnabledByMember: Record<string, boolean>;
  sharingPausedByMember: Record<string, boolean>;
  privateSessionsByMember: Record<string, string[]>;
};

export type WorkspaceControlsAction =
  | { type: "save-setup"; teamName: string; repositoryName: string }
  | { type: "create-invite" }
  | { type: "rotate-invite" }
  | { type: "accept-invite"; token: string; memberName: string }
  | { type: "remove-member"; memberId: string }
  | { type: "preview-as"; memberId: string }
  | { type: "approve-pairing"; requestId: string }
  | { type: "reject-pairing"; requestId: string }
  | { type: "revoke-device"; deviceId: string }
  | { type: "set-sharing-enabled"; enabled: boolean }
  | { type: "set-sharing-paused"; paused: boolean }
  | { type: "set-private-session"; sessionId: string; isPrivate: boolean };

export type TransitionCode =
  "updated" | "unchanged" | "forbidden" | "invalid" | "not-found" | "full" | "rotated";

export type WorkspaceControlsTransition = {
  state: WorkspaceControlsState;
  code: TransitionCode;
  message: string;
  changed: boolean;
};

export const samplePrivateSessionOptions = [
  { id: "sample-sam", label: "Saved-college API · Sam" },
  { id: "sample-sri", label: "Personal shortlist · Sri" },
] as const;

export const initialWorkspaceControls: WorkspaceControlsState = {
  version: 1,
  teamName: "College Compass",
  repositoryName: "college-compass",
  members: [
    { id: "sri", name: "Sri", role: "admin", githubLogin: "Srikamarthapu" },
    { id: "sam", name: "Sam", role: "member" },
  ],
  actingMemberId: "sri",
  inviteToken: "",
  inviteRevision: 0,
  rotatedInviteTokens: [],
  devices: [
    {
      id: "device-sri-claude",
      memberId: "sri",
      memberName: "Sri",
      name: "Sri’s MacBook Pro",
      agent: "Claude Code",
      status: "approved",
    },
  ],
  pairingRequests: [
    {
      id: "pair-sam-codex",
      memberId: "sam",
      memberName: "Sam",
      agent: "Codex",
      repositoryName: "college-compass",
      status: "pending",
      capabilities: {
        eventCapture: "partial",
        overlapCheck: "unsupported",
        warningDelivery: "unsupported",
      },
    },
  ],
  sharingEnabledByMember: { sri: false, sam: false },
  sharingPausedByMember: { sri: false, sam: false },
  privateSessionsByMember: { sri: [], sam: [] },
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

function validId(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9-]{1,64}$/.test(value) ? value : "";
}

function validAgent(value: unknown): AgentName | null {
  return value === "Claude Code" || value === "Codex" ? value : null;
}

function validCapability(value: unknown): CapabilityState | null {
  return value === "partial" || value === "unsupported" ? value : null;
}

function withoutPreference<T>(preferences: Record<string, T>, memberId: string): Record<string, T> {
  const next = { ...preferences };
  delete next[memberId];
  return next;
}

function parseMembers(value: unknown): SampleMember[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxMembers) {
    return initialWorkspaceControls.members.map((member) => ({ ...member }));
  }

  const parsed = value.map((entry) => {
    const item = record(entry);
    const id = validId(item?.id);
    const name = boundedText(item?.name, 48);
    const role = item?.role;
    if (!id || name.length < 2 || (role !== "admin" && role !== "member")) return null;
    const githubLogin =
      typeof item?.githubLogin === "string" && /^[A-Za-z0-9-]{1,39}$/.test(item.githubLogin)
        ? item.githubLogin
        : undefined;
    return githubLogin
      ? ({ id, name, role, githubLogin } satisfies SampleMember)
      : ({ id, name, role } satisfies SampleMember);
  });
  if (parsed.some((member) => member === null)) {
    return initialWorkspaceControls.members.map((member) => ({ ...member }));
  }

  const members = parsed as SampleMember[];
  if (members[0]?.role !== "admin" || members.slice(1).some((member) => member.role === "admin")) {
    return initialWorkspaceControls.members.map((member) => ({ ...member }));
  }
  return members;
}

function parseDevices(value: unknown): SampleDevice[] {
  if (!Array.isArray(value))
    return initialWorkspaceControls.devices.map((device) => ({ ...device }));
  return value.slice(0, maxDevices).flatMap((entry) => {
    const item = record(entry);
    const id = validId(item?.id);
    const memberId = validId(item?.memberId);
    const memberName = boundedText(item?.memberName, 48);
    const name = boundedText(item?.name, 64);
    const agent = validAgent(item?.agent);
    if (!id || !memberId || !memberName || !name || !agent) return [];
    if (item?.status !== "approved" && item?.status !== "revoked") return [];
    return [{ id, memberId, memberName, name, agent, status: item.status }];
  });
}

function parsePairingRequests(value: unknown): SamplePairingRequest[] {
  if (!Array.isArray(value)) {
    return initialWorkspaceControls.pairingRequests.map((request) => ({
      ...request,
      capabilities: { ...request.capabilities },
    }));
  }
  return value.slice(0, maxPairingRequests).flatMap((entry) => {
    const item = record(entry);
    const capabilities = record(item?.capabilities);
    const id = validId(item?.id);
    const memberId = validId(item?.memberId);
    const memberName = boundedText(item?.memberName, 48);
    const agent = validAgent(item?.agent);
    const repositoryName = boundedText(item?.repositoryName, 100);
    const eventCapture = validCapability(capabilities?.eventCapture);
    const overlapCheck = validCapability(capabilities?.overlapCheck);
    const warningDelivery = validCapability(capabilities?.warningDelivery);
    if (!id || !memberId || !memberName || !agent || !repositoryName) return [];
    if (!eventCapture || !overlapCheck || !warningDelivery) return [];
    if (item?.status !== "pending" && item?.status !== "approved" && item?.status !== "rejected")
      return [];
    return [
      {
        id,
        memberId,
        memberName,
        agent,
        repositoryName,
        status: item.status,
        capabilities: { eventCapture, overlapCheck, warningDelivery },
      },
    ];
  });
}

export function parseWorkspaceControlsState(raw: string | null): WorkspaceControlsState {
  if (!raw) return initialWorkspaceControls;
  try {
    const parsed = record(JSON.parse(raw));
    if (!parsed || parsed.version !== 1) return initialWorkspaceControls;

    const members = parseMembers(parsed.members);
    const teamName = boundedText(parsed.teamName, 64);
    const repositoryName = boundedText(parsed.repositoryName, 100);
    const token = boundedText(parsed.inviteToken, 80);
    const rotatedInviteTokens = Array.isArray(parsed.rotatedInviteTokens)
      ? [...new Set(parsed.rotatedInviteTokens.map((value) => boundedText(value, 80).slice(0, 80)))]
          .filter((value) => inviteTokenPattern.test(value))
          .slice(-maxRotatedInvites)
      : [];
    const sharingEnabledSource = record(parsed.sharingEnabledByMember);
    const sharingPausedSource = record(parsed.sharingPausedByMember);
    const privateSessionsSource = record(parsed.privateSessionsByMember);
    const sharingEnabledByMember: Record<string, boolean> = {};
    const sharingPausedByMember: Record<string, boolean> = {};
    const privateSessionsByMember: Record<string, string[]> = {};
    for (const member of members) {
      sharingEnabledByMember[member.id] = sharingEnabledSource?.[member.id] === true;
      sharingPausedByMember[member.id] = sharingPausedSource?.[member.id] === true;
      const sessions = privateSessionsSource?.[member.id];
      privateSessionsByMember[member.id] = Array.isArray(sessions)
        ? [
            ...new Set(
              sessions.filter((id) => samplePrivateSessionOptions.some((item) => item.id === id)),
            ),
          ].slice(0, 2)
        : [];
    }
    const actingMemberId = validId(parsed.actingMemberId);
    const revision = Number.isInteger(parsed.inviteRevision) ? Number(parsed.inviteRevision) : 0;

    return {
      version: 1,
      teamName: teamName.length >= 2 ? teamName : initialWorkspaceControls.teamName,
      repositoryName: repositoryPattern.test(repositoryName)
        ? repositoryName
        : initialWorkspaceControls.repositoryName,
      members,
      actingMemberId: members.some((member) => member.id === actingMemberId)
        ? actingMemberId
        : (members[0]?.id ?? "sri"),
      inviteToken: inviteTokenPattern.test(token) ? token : "",
      inviteRevision: Math.max(0, Math.min(1_000_000, revision)),
      rotatedInviteTokens,
      devices: parseDevices(parsed.devices).filter((device) =>
        members.some((member) => member.id === device.memberId),
      ),
      pairingRequests: parsePairingRequests(parsed.pairingRequests),
      sharingEnabledByMember,
      sharingPausedByMember,
      privateSessionsByMember,
    };
  } catch {
    return initialWorkspaceControls;
  }
}

function transition(
  state: WorkspaceControlsState,
  code: TransitionCode,
  message: string,
  changed = false,
): WorkspaceControlsTransition {
  return { state, code, message, changed };
}

function isAdmin(state: WorkspaceControlsState, actorId: string): boolean {
  return state.members.some((member) => member.id === actorId && member.role === "admin");
}

function sessionOwner(sessionId: string): string | null {
  if (sessionId === "sample-sam") return "sam";
  if (sessionId === "sample-sri") return "sri";
  return null;
}

export function sharingForMember(state: WorkspaceControlsState, memberId: string) {
  return {
    sharingEnabled: state.sharingEnabledByMember[memberId] === true,
    sharingPaused: state.sharingPausedByMember[memberId] === true,
    privateSessions: state.privateSessionsByMember[memberId] ?? [],
  };
}

function forbidden(state: WorkspaceControlsState): WorkspaceControlsTransition {
  return transition(state, "forbidden", "Only the sample team admin can make this change.");
}

export function inviteState(state: WorkspaceControlsState, token: string): InviteState {
  if (!token) return "invalid";
  if (state.rotatedInviteTokens.includes(token)) return "rotated";
  if (state.inviteToken !== token) return "invalid";
  return state.members.length >= maxMembers ? "full" : "valid";
}

export function reduceWorkspaceControls(
  state: WorkspaceControlsState,
  action: WorkspaceControlsAction,
  actorId = state.actingMemberId,
): WorkspaceControlsTransition {
  if (action.type === "preview-as") {
    if (!state.members.some((member) => member.id === action.memberId)) {
      return transition(state, "not-found", "That sample member is not on this team.");
    }
    return transition(
      { ...state, actingMemberId: action.memberId },
      "updated",
      `Previewing as ${state.members.find((member) => member.id === action.memberId)?.name}.`,
      true,
    );
  }

  if (action.type === "accept-invite") {
    const status = inviteState(state, action.token);
    if (status === "rotated") {
      return transition(
        state,
        "rotated",
        "This sample invitation was rotated and can no longer be used.",
      );
    }
    if (status === "invalid") {
      return transition(
        state,
        "invalid",
        "This sample invitation is invalid. Check the link and try again.",
      );
    }
    if (status === "full") {
      return transition(
        state,
        "full",
        "This sample team is full. An admin must remove a member before someone can join.",
      );
    }

    const memberName = boundedText(action.memberName, 48);
    if (memberName.length < 2) {
      return transition(state, "invalid", "Enter a name with at least two characters.");
    }
    const suffix = state.members.filter((member) => member.id.startsWith("guest-")).length + 1;
    const guest: SampleMember = {
      id: `guest-${state.inviteRevision}-${suffix}`,
      name: memberName,
      role: "member",
    };
    return transition(
      { ...state, members: [...state.members, guest] },
      "updated",
      `${memberName} joined the sample team as a member.`,
      true,
    );
  }

  const memberOwnAction =
    action.type === "approve-pairing" ||
    action.type === "reject-pairing" ||
    action.type === "revoke-device" ||
    action.type === "set-sharing-enabled" ||
    action.type === "set-sharing-paused" ||
    action.type === "set-private-session";
  if (memberOwnAction && !state.members.some((member) => member.id === actorId)) {
    return transition(
      state,
      "forbidden",
      "Choose a current sample team member before changing personal settings.",
    );
  }
  if (!memberOwnAction && !isAdmin(state, actorId)) return forbidden(state);

  switch (action.type) {
    case "save-setup": {
      const teamName = boundedText(action.teamName, 64);
      const repositoryName = boundedText(action.repositoryName, 100);
      if (teamName.length < 2 || !repositoryPattern.test(repositoryName)) {
        return transition(
          state,
          "invalid",
          "Enter a team name and one repository as owner/name or a repository slug.",
        );
      }
      if (teamName === state.teamName && repositoryName === state.repositoryName) {
        return transition(
          state,
          "unchanged",
          "Your sample team and repository are already up to date.",
        );
      }
      return transition(
        { ...state, teamName, repositoryName },
        "updated",
        "Sample team and repository settings saved in this browser.",
        true,
      );
    }
    case "create-invite": {
      if (state.inviteToken) {
        return transition(
          state,
          "unchanged",
          "A reusable sample invitation is already active. Copy or rotate it.",
        );
      }
      const nextRevision = Math.min(1_000_000, state.inviteRevision + 1);
      return transition(
        { ...state, inviteToken: `sample-invite-${nextRevision}`, inviteRevision: nextRevision },
        "updated",
        "Reusable sample invitation created.",
        true,
      );
    }
    case "rotate-invite": {
      const nextRevision = Math.min(1_000_000, state.inviteRevision + 1);
      const oldTokens = state.inviteToken
        ? [...state.rotatedInviteTokens, state.inviteToken].slice(-maxRotatedInvites)
        : state.rotatedInviteTokens;
      return transition(
        {
          ...state,
          inviteToken: `sample-invite-${nextRevision}`,
          inviteRevision: nextRevision,
          rotatedInviteTokens: oldTokens,
        },
        "updated",
        state.inviteToken
          ? "Invitation rotated. The previous sample link no longer works."
          : "Reusable sample invitation created.",
        true,
      );
    }
    case "remove-member": {
      const member = state.members.find((item) => item.id === action.memberId);
      if (!member)
        return transition(state, "not-found", "That sample member is no longer on this team.");
      if (member.role === "admin" || member.id === actorId) {
        return transition(
          state,
          "forbidden",
          "The team owner and your current sample identity cannot be removed.",
        );
      }
      const members = state.members.filter((item) => item.id !== member.id);
      const devices = state.devices.map((device) =>
        device.memberId === member.id ? { ...device, status: "revoked" as const } : device,
      );
      const pairingRequests = state.pairingRequests.map((request) =>
        request.memberId === member.id && request.status === "pending"
          ? { ...request, status: "rejected" as const }
          : request,
      );
      const actingMemberId = members.some((item) => item.id === state.actingMemberId)
        ? state.actingMemberId
        : (members[0]?.id ?? "sri");
      const sharingEnabledByMember = withoutPreference(state.sharingEnabledByMember, member.id);
      const sharingPausedByMember = withoutPreference(state.sharingPausedByMember, member.id);
      const privateSessionsByMember = withoutPreference(state.privateSessionsByMember, member.id);
      return transition(
        {
          ...state,
          members,
          devices,
          pairingRequests,
          actingMemberId,
          sharingEnabledByMember,
          sharingPausedByMember,
          privateSessionsByMember,
        },
        "updated",
        `${member.name} was removed from the sample team. Their sample devices were revoked.`,
        true,
      );
    }
    case "approve-pairing": {
      const request = state.pairingRequests.find((item) => item.id === action.requestId);
      if (!request || request.status !== "pending") {
        return transition(state, "not-found", "That sample pairing request is no longer pending.");
      }
      if (!state.members.some((member) => member.id === request.memberId)) {
        return transition(
          state,
          "invalid",
          "The requesting sample member is no longer on this team.",
        );
      }
      if (request.memberId !== actorId) {
        return transition(
          state,
          "forbidden",
          `Only ${request.memberName} can approve this sample device for their own account.`,
        );
      }
      if (request.repositoryName !== state.repositoryName) {
        return transition(
          state,
          "invalid",
          "The requested repository does not match this team’s linked repository.",
        );
      }
      if (state.devices.length >= maxDevices) {
        return transition(
          state,
          "full",
          "The sample device list is full. Revoke a device before approving another.",
        );
      }
      const member = state.members.find((item) => item.id === request.memberId)!;
      const device: SampleDevice = {
        id: `device-${request.id}`,
        memberId: member.id,
        memberName: member.name,
        name: `${member.name}’s ${request.agent} sample device`,
        agent: request.agent,
        status: "approved",
      };
      const pairingRequests = state.pairingRequests.map((item) =>
        item.id === request.id ? { ...item, status: "approved" as const } : item,
      );
      return transition(
        { ...state, devices: [...state.devices, device], pairingRequests },
        "updated",
        "Sample device approved for this member and repository. No device credential was generated.",
        true,
      );
    }
    case "reject-pairing": {
      const request = state.pairingRequests.find((item) => item.id === action.requestId);
      if (!request || request.status !== "pending") {
        return transition(state, "not-found", "That sample pairing request is no longer pending.");
      }
      if (request.memberId !== actorId) {
        return transition(
          state,
          "forbidden",
          `Only ${request.memberName} can decline this sample device request.`,
        );
      }
      return transition(
        {
          ...state,
          pairingRequests: state.pairingRequests.map((item) =>
            item.id === request.id ? { ...item, status: "rejected" as const } : item,
          ),
        },
        "updated",
        "Sample pairing request declined.",
        true,
      );
    }
    case "revoke-device": {
      const device = state.devices.find((item) => item.id === action.deviceId);
      if (!device) return transition(state, "not-found", "That sample device was not found.");
      if (device.memberId !== actorId) {
        return transition(
          state,
          "forbidden",
          `Only ${device.memberName} can revoke their own sample device.`,
        );
      }
      if (device.status === "revoked")
        return transition(state, "unchanged", "This sample device is already revoked.");
      return transition(
        {
          ...state,
          devices: state.devices.map((item) =>
            item.id === device.id ? { ...item, status: "revoked" as const } : item,
          ),
        },
        "updated",
        "Sample device revoked. No live credential or adapter was changed.",
        true,
      );
    }
    case "set-sharing-enabled": {
      if (action.enabled && !state.repositoryName) {
        return transition(state, "invalid", "Set up a sample repository before enabling sharing.");
      }
      if (state.sharingEnabledByMember[actorId] === action.enabled) {
        return transition(
          state,
          "unchanged",
          action.enabled ? "Sample sharing is already enabled." : "Sample sharing is already off.",
        );
      }
      return transition(
        {
          ...state,
          sharingEnabledByMember: { ...state.sharingEnabledByMember, [actorId]: action.enabled },
        },
        "updated",
        action.enabled
          ? "Your sample sharing opt-in is enabled for future sessions in this repository."
          : "Your sample sharing opt-in is off for future sessions. Existing sample history remains unchanged.",
        true,
      );
    }
    case "set-sharing-paused": {
      if (state.sharingPausedByMember[actorId] === action.paused) {
        return transition(
          state,
          "unchanged",
          action.paused
            ? "Sample sharing is already paused."
            : "Sample sharing is already resumed.",
        );
      }
      return transition(
        {
          ...state,
          sharingPausedByMember: { ...state.sharingPausedByMember, [actorId]: action.paused },
        },
        "updated",
        action.paused
          ? "Your sample sharing is paused. Previously shared sample history remains unchanged."
          : "Your sample sharing is resumed for sessions allowed by the repository setting.",
        true,
      );
    }
    case "set-private-session": {
      if (!samplePrivateSessionOptions.some((item) => item.id === action.sessionId)) {
        return transition(state, "invalid", "That sample session cannot be updated.");
      }
      if (sessionOwner(action.sessionId) !== actorId) {
        const ownerName =
          state.members.find((member) => member.id === sessionOwner(action.sessionId))?.name ??
          "its owner";
        return transition(
          state,
          "forbidden",
          `Only ${ownerName} can change this sample session’s privacy setting.`,
        );
      }
      const currentPrivateSessions = state.privateSessionsByMember[actorId] ?? [];
      const privateSessions = action.isPrivate
        ? [...new Set([...currentPrivateSessions, action.sessionId])].slice(0, 2)
        : currentPrivateSessions.filter((id) => id !== action.sessionId);
      if (
        privateSessions.length === currentPrivateSessions.length &&
        privateSessions.every((id, index) => id === currentPrivateSessions[index])
      ) {
        return transition(
          state,
          "unchanged",
          "That sample session already has this privacy setting.",
        );
      }
      return transition(
        {
          ...state,
          privateSessionsByMember: { ...state.privateSessionsByMember, [actorId]: privateSessions },
        },
        "updated",
        action.isPrivate
          ? "This sample session is private and excluded from future sharing."
          : "This sample session is eligible for sharing when repository sharing is enabled.",
        true,
      );
    }
  }
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", callback);
  window.addEventListener(changedEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(changedEvent, callback);
  };
}

function rawSnapshot(): string | null {
  try {
    return typeof window === "undefined"
      ? null
      : window.localStorage.getItem(WORKSPACE_CONTROLS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeState(state: WorkspaceControlsState): boolean {
  try {
    window.localStorage.setItem(WORKSPACE_CONTROLS_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event(changedEvent));
    return true;
  } catch {
    return false;
  }
}

export function dispatchWorkspaceControlsAction(
  action: WorkspaceControlsAction,
  actorId = initialWorkspaceControls.actingMemberId,
): WorkspaceControlsTransition {
  const current = parseWorkspaceControlsState(rawSnapshot());
  const result = reduceWorkspaceControls(current, action, actorId);
  if (result.changed && !writeState(result.state)) {
    return transition(
      current,
      "invalid",
      "Could not save sample controls in this browser. Check local storage access and try again.",
    );
  }
  return result;
}

export function resetWorkspaceControls(): boolean {
  return writeState(initialWorkspaceControls);
}

export function useWorkspaceControls() {
  const raw = useSyncExternalStore(subscribe, rawSnapshot, () => null);
  const state = useMemo(() => parseWorkspaceControlsState(raw), [raw]);
  const actor =
    state.members.find((member) => member.id === state.actingMemberId) ?? state.members[0];
  const sharing = sharingForMember(state, actor?.id ?? "");
  return {
    state,
    actor,
    ...sharing,
    dispatch: (action: WorkspaceControlsAction) =>
      dispatchWorkspaceControlsAction(action, actor?.id),
    reset: resetWorkspaceControls,
  };
}
