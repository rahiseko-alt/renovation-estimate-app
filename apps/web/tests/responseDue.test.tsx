// D4 の見積回答期限（打ち直せる期限）を見る（利用者の指示 2026-08-07。
// docs/flows.md「デモの画面の並び」D4）。見るのは4つ：
//
// - 日付欄の初期値が**当日＋7日**（日本時間）で開くこと
// - 打ち直した期限が、そのまま書類の「見積回答期限」に印字されること
// - **法定の最短見積期間より短い日付が、サーバ側で弾かれる**こと
//   （画面の判定はバイパスできるので、Server Action を直接呼んで確かめる）
// - 期限を渡さない通常経路（/projects/[id]/send）が、これまでどおり自動計算になること
//
// **モックにしない。** ローカル Supabase に実際に案件・下請・依頼を作り、
// 保存された response_due_at をそのまま読む。差し替えるのはログイン中の利用者だけ
// （Server Action は cookie を読むため。tests/estimatePdfAction.test.ts と同じ手）。

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DocumentConfirmScreen } from "../components/DocumentConfirmScreen";
import { getSupabaseClient } from "../lib/db/client";
import { createProject } from "../lib/db/projects";
import { getQuoteRequestDocData } from "../lib/db/quoteRequestDoc";
import { setLegalItemSlot } from "../lib/db/legalItemSlots";
import { setSiteConditionCheck } from "../lib/db/siteConditionChecks";
import { createSubcontractor } from "../lib/db/subcontractors";
import {
  LEGAL_ITEM_SLOT_KEYS,
  SITE_CONDITION_CATEGORIES,
  type Project,
} from "../lib/db/types";
import { formatDateJst } from "../lib/doc/date";
import {
  DOCUMENT_PLANNED_PRICE_BAND,
  RESPONSE_DUE_DEFAULT_DAYS,
} from "../lib/flowText";
import {
  computeResponseDueAt,
  earliestResponseDueDateInput,
  jstDateInputAfterDays,
  minimumQuotePeriodDays,
  responseDueAtFromDateInput,
  toJstDateInput,
} from "../lib/legalPeriod";

const currentUser = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("../lib/auth/server", () => ({
  getCurrentUser: async () => currentUser.value,
}));

const { sendQuoteRequestGroup } = await import(
  "../app/projects/[id]/send/actions"
);
const { sendFromDocumentAction } = await import(
  "../app/projects/[id]/document/actions"
);

// 案件・下請の登録件数には所有者ごとの上限（lib/limits.ts）がある。共用の
// owner-a@example.com を使い切らないよう、この検査専用の所有者を使う。
const OWNER = "response-due-owner@example.com";

const DAY_MILLIS = 24 * 60 * 60 * 1000;

/** 送信ゲート（21項目）を満たした案件と、送り先の下請を1社作る。 */
async function projectReadyToSend(
  name: string,
): Promise<{ project: Project; subcontractorId: string }> {
  const project = await createProject(
    { customerName: name, siteAddress: `${name}の現場` },
    OWNER,
  );
  for (const slotKey of LEGAL_ITEM_SLOT_KEYS) {
    await setLegalItemSlot(project.id, OWNER, slotKey, "filled", `値-${slotKey}`);
  }
  for (const category of SITE_CONDITION_CATEGORIES) {
    await setSiteConditionCheck(project.id, OWNER, category, "include");
  }
  const subcontractor = await createSubcontractor(
    { companyName: `${name}工務店`, email: `${crypto.randomUUID()}@example.com` },
    OWNER,
  );
  return { project, subcontractorId: subcontractor.id };
}

/** 案件に保存された依頼の「提示日時」と「回答期限」を、DBからそのまま読む。 */
async function savedRequestTimes(
  projectId: string,
): Promise<{ presentedAt: Date; responseDueAt: Date }[]> {
  const { data, error } = await getSupabaseClient()
    .from("quote_group_requests")
    .select(
      `
        response_due_at,
        quote_request_groups!inner ( project_id, presented_at )
      `,
    )
    .eq("owner_id", OWNER)
    .eq("quote_request_groups.project_id", projectId);
  if (error) throw error;
  return (
    data as unknown as {
      response_due_at: string;
      quote_request_groups: { presented_at: string };
    }[]
  ).map((row) => ({
    presentedAt: new Date(row.quote_request_groups.presented_at),
    responseDueAt: new Date(row.response_due_at),
  }));
}

describe("D4 の見積回答期限（画面）", () => {
  it("日付欄は当日＋7日で開く（日本時間の暦日で数える）", () => {
    // 利用者の指示（2026-08-07）はこの日数そのもの。数字は lib/flowText.ts の1箇所。
    expect(RESPONSE_DUE_DEFAULT_DAYS).toBe(7);
    // 日本時間では 8/7 の夜だが UTC ではまだ 8/7 の昼、という瞬間で確かめる
    // （素の getFullYear() で組み立てていると、ここで1日ずれる）。
    const now = new Date("2026-08-07T23:30:00+09:00");
    expect(jstDateInputAfterDays(now, RESPONSE_DUE_DEFAULT_DAYS)).toBe(
      "2026-08-14",
    );
  });

  it("初期値が日付欄にも書類の見積回答期限にも同じ日で出る", async () => {
    const project = await createProject(
      { customerName: "期限の初期値", siteAddress: "テスト住所" },
      OWNER,
    );
    const now = new Date("2026-08-07T23:30:00+09:00");
    const defaultValue = jstDateInputAfterDays(now, RESPONSE_DUE_DEFAULT_DAYS);
    const data = await getQuoteRequestDocData(
      project,
      OWNER,
      responseDueAtFromDateInput(defaultValue),
    );

    const html = renderToStaticMarkup(
      <DocumentConfirmScreen
        data={data}
        projectId={project.id}
        editHref={`/projects/${project.id}`}
        saveHref="/drafts"
        responseDue={{
          defaultValue,
          earliestValue: earliestResponseDueDateInput(
            now,
            DOCUMENT_PLANNED_PRICE_BAND,
          ),
          earliestText: formatDateJst(
            computeResponseDueAt(now, DOCUMENT_PLANNED_PRICE_BAND),
          ),
        }}
      />,
    );

    // 打ち直せる欄が1つ出ていて、初期値が入っている。
    expect(html).toContain('type="date"');
    expect(html).toContain(`value="${defaultValue}"`);
    // **ラベルだけの空欄で出さない。** 同じ日が書類にも印字される。
    expect(html).toContain("見積回答期限");
    expect(html).toContain("2026年8月14日まで");
  });
});

describe("D4 の見積回答期限（保存と法定の最短見積期間）", () => {
  it("入れた期限が、そのまま依頼に保存される", async () => {
    const { project, subcontractorId } = await projectReadyToSend("期限を入れて送る");
    currentUser.value = OWNER;
    const dueDate = jstDateInputAfterDays(new Date(), RESPONSE_DUE_DEFAULT_DAYS);

    await sendQuoteRequestGroup(
      project.id,
      [subcontractorId],
      DOCUMENT_PLANNED_PRICE_BAND,
      dueDate,
    );

    const saved = await savedRequestTimes(project.id);
    expect(saved).toHaveLength(1);
    // 保存されているのは瞬間だが、日本時間の暦日は入れた日そのもの。
    expect(toJstDateInput(saved[0]!.responseDueAt)).toBe(dueDate);
  });

  it("法定の最短見積期間より短い日付は、画面を通さず呼んでも弾かれる", async () => {
    const { project, subcontractorId } = await projectReadyToSend("短すぎる期限");
    currentUser.value = OWNER;
    // 当日（＝提示日と同じ日）は、どの帯でも最短日数に届かない。
    const today = toJstDateInput(new Date());

    await expect(
      sendQuoteRequestGroup(
        project.id,
        [subcontractorId],
        DOCUMENT_PLANNED_PRICE_BAND,
        today,
      ),
    ).rejects.toThrow(/建設業法施行令第6条/);

    // 弾かれた以上、依頼は1件も残らない。
    expect(await savedRequestTimes(project.id)).toHaveLength(0);
  });

  it("確認画面（D4）の送信は、弾いた理由を throw ではなく返り値で返す", async () => {
    const { project } = await projectReadyToSend("弾いた理由の返し方");
    currentUser.value = OWNER;
    const today = toJstDateInput(new Date());

    const result = await sendFromDocumentAction(project.id, today);

    // 本番ビルドで Server Action の例外は伏せられるため、返り値で受け取る。
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("弾かれていない");
    // 「不正な値です」で終わらせない。理由（法令）と、いつ以降なら選べるかを出す。
    expect(result.message).toContain("建設業法施行令第6条");
    expect(result.message).toContain(
      formatDateJst(computeResponseDueAt(new Date(), DOCUMENT_PLANNED_PRICE_BAND)),
    );
    expect(await savedRequestTimes(project.id)).toHaveLength(0);
  });

  it("期限を渡さない通常経路は、これまでどおり提示日時＋法定日数になる", async () => {
    const { project, subcontractorId } = await projectReadyToSend("期限なしで送る");
    currentUser.value = OWNER;

    // /projects/[id]/send はこの引数の数で呼ぶ（期限を渡さない）。
    await sendQuoteRequestGroup(
      project.id,
      [subcontractorId],
      DOCUMENT_PLANNED_PRICE_BAND,
    );

    const saved = await savedRequestTimes(project.id);
    expect(saved).toHaveLength(1);
    expect(
      saved[0]!.responseDueAt.getTime() - saved[0]!.presentedAt.getTime(),
    ).toBe(minimumQuotePeriodDays(DOCUMENT_PLANNED_PRICE_BAND) * DAY_MILLIS);
  });
});
