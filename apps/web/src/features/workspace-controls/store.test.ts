import { describe, expect, it } from "vitest";
import {
  initialWorkspaceControls,
  inviteState,
  reduceWorkspaceControls,
  sharingForMember,
} from "./store";

describe("workspace controls sample reducer", () => {
  it("reuses a current invite and rejects its link after rotation", () => {
    const created = reduceWorkspaceControls(
      initialWorkspaceControls,
      { type: "create-invite" },
      "sri",
    );
    expect(created.state.inviteToken).toBe("sample-invite-1");
    expect(created.state.members).toHaveLength(2);

    const rotated = reduceWorkspaceControls(created.state, { type: "rotate-invite" }, "sri");
    expect(rotated.state.inviteToken).toBe("sample-invite-2");
    expect(inviteState(rotated.state, "sample-invite-1")).toBe("rotated");
    expect(inviteState(rotated.state, "sample-invite-2")).toBe("full");

    const reusable = reduceWorkspaceControls(
      rotated.state,
      { type: "remove-member", memberId: "sam" },
      "sri",
    );
    const joined = reduceWorkspaceControls(
      reusable.state,
      { type: "accept-invite", token: "sample-invite-2", memberName: "Alex" },
      "sri",
    );
    expect(joined.code).toBe("updated");
    expect(joined.state.members.at(-1)).toEqual({ id: "guest-2-1", name: "Alex", role: "member" });
    expect(inviteState(joined.state, "sample-invite-2")).toBe("full");
  });

  it("blocks member-only and owner-removal mutations", () => {
    const invite = reduceWorkspaceControls(
      initialWorkspaceControls,
      { type: "create-invite" },
      "sri",
    );
    const memberRemoval = reduceWorkspaceControls(
      invite.state,
      { type: "remove-member", memberId: "sam" },
      "sam",
    );
    const memberRotation = reduceWorkspaceControls(invite.state, { type: "rotate-invite" }, "sam");
    const ownerRemoval = reduceWorkspaceControls(
      invite.state,
      { type: "remove-member", memberId: "sri" },
      "sri",
    );

    expect(memberRemoval.code).toBe("forbidden");
    expect(memberRemoval.state.members).toHaveLength(2);
    expect(memberRotation.code).toBe("forbidden");
    expect(memberRotation.state.inviteToken).toBe("sample-invite-1");
    expect(ownerRemoval.code).toBe("forbidden");
    expect(ownerRemoval.state.members[0]?.role).toBe("admin");
  });

  it("allows invite acceptance only through the current token and assigns member role", () => {
    const created = reduceWorkspaceControls(
      initialWorkspaceControls,
      { type: "create-invite" },
      "sri",
    );
    const openedSeat = reduceWorkspaceControls(
      created.state,
      { type: "remove-member", memberId: "sam" },
      "sri",
    );
    const stale = reduceWorkspaceControls(
      openedSeat.state,
      { type: "accept-invite", token: "sample-invite-999", memberName: "Alex" },
      "sri",
    );
    const ownerName = reduceWorkspaceControls(
      openedSeat.state,
      { type: "accept-invite", token: "sample-invite-1", memberName: "Alex" },
      "sri",
    );

    expect(stale.code).toBe("invalid");
    expect(stale.state.members).toHaveLength(1);
    expect(ownerName.state.members.at(-1)?.role).toBe("member");
  });

  it("scopes pairing, device revocation, and private-session controls to their owner", () => {
    const adminApprovesSam = reduceWorkspaceControls(
      initialWorkspaceControls,
      { type: "approve-pairing", requestId: "pair-sam-codex" },
      "sri",
    );
    const samApproves = reduceWorkspaceControls(
      initialWorkspaceControls,
      { type: "approve-pairing", requestId: "pair-sam-codex" },
      "sam",
    );
    const samRevokesSri = reduceWorkspaceControls(
      samApproves.state,
      { type: "revoke-device", deviceId: "device-sri-claude" },
      "sam",
    );
    const samRevokesOwn = reduceWorkspaceControls(
      samApproves.state,
      { type: "revoke-device", deviceId: "device-pair-sam-codex" },
      "sam",
    );
    const sriPrivatizesSam = reduceWorkspaceControls(
      initialWorkspaceControls,
      { type: "set-private-session", sessionId: "sample-sam", isPrivate: true },
      "sri",
    );
    const samPrivatizesOwnSession = reduceWorkspaceControls(
      initialWorkspaceControls,
      { type: "set-private-session", sessionId: "sample-sam", isPrivate: true },
      "sam",
    );
    const samOptsIn = reduceWorkspaceControls(
      samPrivatizesOwnSession.state,
      { type: "set-sharing-enabled", enabled: true },
      "sam",
    );

    expect(adminApprovesSam.code).toBe("forbidden");
    expect(samApproves.code).toBe("updated");
    expect(samApproves.state.devices.at(-1)?.memberId).toBe("sam");
    expect(samRevokesSri.code).toBe("forbidden");
    expect(samRevokesOwn.code).toBe("updated");
    expect(samRevokesOwn.state.devices.at(-1)?.status).toBe("revoked");
    expect(sriPrivatizesSam.code).toBe("forbidden");
    expect(sharingForMember(samOptsIn.state, "sam")).toEqual({
      sharingEnabled: true,
      sharingPaused: false,
      privateSessions: ["sample-sam"],
    });
    expect(sharingForMember(samOptsIn.state, "sri")).toEqual({
      sharingEnabled: false,
      sharingPaused: false,
      privateSessions: [],
    });
  });
});
