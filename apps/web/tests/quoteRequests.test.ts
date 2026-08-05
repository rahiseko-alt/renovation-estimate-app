import { describe, expect, it } from "vitest";

import { createProject } from "../lib/db/projects";
import {
  createQuoteRequest,
  getQuoteRequestByToken,
  getQuoteRequestForOwner,
  listQuoteRequestsForProject,
  markQuoteRequestImported,
  submitQuoteResponse,
} from "../lib/db/quoteRequests";

const OWNER_A = "owner-a@example.com";
const OWNER_B = "owner-b@example.com";

async function newProject(ownerId: string) {
  return createProject(
    { customerName: "テスト施主", siteAddress: "テスト住所" },
    ownerId,
  );
}

function newQuoteRequestInput(projectId: string) {
  return {
    projectId,
    itemName: "クロス張替え",
    itemSpec: "量産品",
    quantity: 10,
    unit: "㎡",
    taxCategory: "standard" as const,
    markupRate: 1.25,
  };
}

describe("quoteRequests", () => {
  it("作った依頼を、作った本人は取得できる", async () => {
    const project = await newProject(OWNER_A);
    const quoteRequest = await createQuoteRequest(
      newQuoteRequestInput(project.id),
      OWNER_A,
    );
    expect(quoteRequest.status).toBe("pending");
    expect(quoteRequest.costUnitPrice).toBeNull();
    expect(await getQuoteRequestForOwner(quoteRequest.id, OWNER_A)).toEqual(
      quoteRequest,
    );
  });

  it("他人が作った依頼はIDを知っていても取得できない（IDOR対策）", async () => {
    const project = await newProject(OWNER_A);
    const quoteRequest = await createQuoteRequest(
      newQuoteRequestInput(project.id),
      OWNER_A,
    );
    expect(await getQuoteRequestForOwner(quoteRequest.id, OWNER_B)).toBeNull();
  });

  it("一覧には自分の案件の依頼だけが含まれる", async () => {
    const mineProject = await newProject(OWNER_A);
    const othersProject = await newProject(OWNER_B);
    const mine = await createQuoteRequest(
      newQuoteRequestInput(mineProject.id),
      OWNER_A,
    );
    const others = await createQuoteRequest(
      newQuoteRequestInput(othersProject.id),
      OWNER_B,
    );
    const list = await listQuoteRequestsForProject(mineProject.id, OWNER_A);
    expect(list.some((q) => q.id === mine.id)).toBe(true);
    expect(list.some((q) => q.id === others.id)).toBe(false);
  });

  it("token を知っていれば owner でなくても取得できる（下請の回答画面用）", async () => {
    const project = await newProject(OWNER_A);
    const quoteRequest = await createQuoteRequest(
      newQuoteRequestInput(project.id),
      OWNER_A,
    );
    const byToken = await getQuoteRequestByToken(quoteRequest.token);
    expect(byToken?.id).toBe(quoteRequest.id);
  });

  it("存在しない token は null", async () => {
    expect(
      await getQuoteRequestByToken("00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });

  it("回答すると status が responded になり、原価単価が入る", async () => {
    const project = await newProject(OWNER_A);
    const quoteRequest = await createQuoteRequest(
      newQuoteRequestInput(project.id),
      OWNER_A,
    );
    const responded = await submitQuoteResponse(quoteRequest.token, 8000);
    expect(responded?.status).toBe("responded");
    expect(responded?.costUnitPrice).toBe(8000);
    expect(responded?.respondedAt).not.toBeNull();
  });

  it("既に回答済みの依頼には二重に回答できない", async () => {
    const project = await newProject(OWNER_A);
    const quoteRequest = await createQuoteRequest(
      newQuoteRequestInput(project.id),
      OWNER_A,
    );
    await submitQuoteResponse(quoteRequest.token, 8000);
    const second = await submitQuoteResponse(quoteRequest.token, 9000);
    expect(second).toBeNull();

    const stored = await getQuoteRequestForOwner(quoteRequest.id, OWNER_A);
    expect(stored?.costUnitPrice).toBe(8000);
  });

  it("回答が届く前は取り込めない", async () => {
    const project = await newProject(OWNER_A);
    const quoteRequest = await createQuoteRequest(
      newQuoteRequestInput(project.id),
      OWNER_A,
    );
    expect(await markQuoteRequestImported(quoteRequest.id, OWNER_A)).toBeNull();
  });

  it("回答が届いた依頼は取り込める。取り込むと status が imported になる", async () => {
    const project = await newProject(OWNER_A);
    const quoteRequest = await createQuoteRequest(
      newQuoteRequestInput(project.id),
      OWNER_A,
    );
    await submitQuoteResponse(quoteRequest.token, 8000);
    const imported = await markQuoteRequestImported(quoteRequest.id, OWNER_A);
    expect(imported?.status).toBe("imported");
    expect(imported?.importedAt).not.toBeNull();
  });

  it("同じ依頼を二重に取り込めない", async () => {
    const project = await newProject(OWNER_A);
    const quoteRequest = await createQuoteRequest(
      newQuoteRequestInput(project.id),
      OWNER_A,
    );
    await submitQuoteResponse(quoteRequest.token, 8000);
    await markQuoteRequestImported(quoteRequest.id, OWNER_A);
    expect(await markQuoteRequestImported(quoteRequest.id, OWNER_A)).toBeNull();
  });

  it("他人は取り込めない（IDOR対策）", async () => {
    const project = await newProject(OWNER_A);
    const quoteRequest = await createQuoteRequest(
      newQuoteRequestInput(project.id),
      OWNER_A,
    );
    await submitQuoteResponse(quoteRequest.token, 8000);
    expect(await markQuoteRequestImported(quoteRequest.id, OWNER_B)).toBeNull();

    const stored = await getQuoteRequestForOwner(quoteRequest.id, OWNER_A);
    expect(stored?.status).toBe("responded");
  });
});
