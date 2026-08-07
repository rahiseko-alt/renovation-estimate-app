// 明細の印のうち**保留**の側（docs/flows.md「デモの画面の並び」D6）。
// 採用の側は tests/lineAdoptions.test.ts が見る。土台は support/lineMarkSetup.ts に
// 1つだけ置いて両方から使う。

import { describe, expect, it } from "vitest";

import { getSupabaseClient } from "../lib/db/client";
import {
  cancelLineAdoption,
  listLineAdoptionsForProject,
  listLineMarksForProject,
  markLine,
} from "../lib/db/lineAdoptions";
import {
  OWNER_A,
  OWNER_B,
  requestTo,
  setupProject,
} from "./support/lineMarkSetup";

describe("明細の保留", () => {
  it("保留は1明細に何社でも付く（採用の排他に巻き込まれない）", async () => {
    const { project, group, lineOne } = await setupProject("保留1");
    const a = await requestTo(group.id, "保留1社A", "hold1a@example.com", [lineOne]);
    const b = await requestTo(group.id, "保留1社B", "hold1b@example.com", [lineOne]);
    const c = await requestTo(group.id, "保留1社C", "hold1c@example.com", [lineOne]);

    await markLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: a.id, status: "adopted" },
      OWNER_A,
    );
    await markLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: b.id, status: "on_hold" },
      OWNER_A,
    );
    await markLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: c.id, status: "on_hold" },
      OWNER_A,
    );

    const marks = await listLineMarksForProject(project.id, OWNER_A);
    expect(marks).toHaveLength(3);
    expect(marks.filter((m) => m.status === "adopted")).toHaveLength(1);
    expect(marks.filter((m) => m.status === "on_hold")).toHaveLength(2);

    // 採用だけを見る側には、保留は1件も混ざらない。
    const adoptions = await listLineAdoptionsForProject(project.id, OWNER_A);
    expect(adoptions).toHaveLength(1);
    expect(adoptions[0]!.quoteGroupRequestId).toBe(a.id);
  });

  it("保留を採用に変えられる（一歩手前の置き場として使える）", async () => {
    const { project, group, lineOne } = await setupProject("保留2");
    const a = await requestTo(group.id, "保留2社A", "hold2a@example.com", [lineOne]);

    await markLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: a.id, status: "on_hold" },
      OWNER_A,
    );
    const promoted = await markLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: a.id, status: "adopted" },
      OWNER_A,
    );

    expect(promoted.status).toBe("adopted");
    // 印が増えていない（同じ社の印は置き換わる）。
    expect(await listLineMarksForProject(project.id, OWNER_A)).toHaveLength(1);
  });

  it("採用を別の社に付け替えると、前の社は保留に下がって一覧に残る", async () => {
    const { project, group, lineOne } = await setupProject("保留3");
    const a = await requestTo(group.id, "保留3社A", "hold3a@example.com", [lineOne]);
    const b = await requestTo(group.id, "保留3社B", "hold3b@example.com", [lineOne]);

    await markLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: a.id, status: "adopted" },
      OWNER_A,
    );
    await markLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: b.id, status: "adopted" },
      OWNER_A,
    );

    const marks = await listLineMarksForProject(project.id, OWNER_A);
    expect(marks).toHaveLength(2);
    const byRequest = new Map(marks.map((m) => [m.quoteGroupRequestId, m.status]));
    expect(byRequest.get(b.id)).toBe("adopted");
    // 消えていない。保留として残る。
    expect(byRequest.get(a.id)).toBe("on_hold");
  });

  it("採用の取り消しは、同じ明細の保留を巻き込まない", async () => {
    const { project, group, lineOne } = await setupProject("保留4");
    const a = await requestTo(group.id, "保留4社A", "hold4a@example.com", [lineOne]);
    const b = await requestTo(group.id, "保留4社B", "hold4b@example.com", [lineOne]);

    await markLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: a.id, status: "adopted" },
      OWNER_A,
    );
    await markLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: b.id, status: "on_hold" },
      OWNER_A,
    );

    expect(await cancelLineAdoption(project.id, lineOne, OWNER_A)).toBe(true);

    const marks = await listLineMarksForProject(project.id, OWNER_A);
    expect(marks).toHaveLength(1);
    expect(marks[0]!.quoteGroupRequestId).toBe(b.id);
    expect(marks[0]!.status).toBe("on_hold");
  });

  it("印を付けるのに失敗したら、前の採用は adopted のまま残る（下ろすだけで終わらない）", async () => {
    const { project, group, lineOne } = await setupProject("保留6");
    const a = await requestTo(group.id, "保留6社A", "hold6a@example.com", [lineOne]);

    await markLine(
      { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: a.id, status: "adopted" },
      OWNER_A,
    );

    // **markLine の入口からは、この失敗に確実には届かない。** 実在しない依頼ID・
    // 他人の依頼ID・対象範囲外の明細は、DBに触る前に assertMarkable が弾く
    // （弾くのが正しい）。残るのは「読んだ直後に依頼が消えた」たぐいの割り込みで、
    // 外から狙って起こせない。そこで markLine が原子性を預けている先――
    // DB関数 mark_line（supabase/migrations/20260807020000_mark_line_atomic.sql）――を
    // 直接呼び、その契約を見る。実在しない依頼IDを渡すと、
    // 「他社の採用を下ろす」が済んだあとで quote_group_request_id の外部キーに落ちる。
    //
    // **ここで見ているのは「途中で落ちても何も残らない」こと。**
    // 例外を握り潰す分岐（`exception when ... then`）を後から足すと、下ろしたところで
    // 止まり、この明細は採用0社になる（画面には「選べませんでした」しか出ない）。
    // その形になっていないことを固定する。
    const { error } = await getSupabaseClient().rpc("mark_line", {
      p_project_id: project.id,
      p_owner_id: OWNER_A,
      p_line_item_id: lineOne,
      p_request_id: "00000000-0000-4000-8000-000000000000",
      p_status: "adopted",
    });
    expect(error).not.toBeNull();

    const marks = await listLineMarksForProject(project.id, OWNER_A);
    expect(marks).toHaveLength(1);
    expect(marks[0]!.quoteGroupRequestId).toBe(a.id);
    expect(marks[0]!.status).toBe("adopted");
  });

  it("保留も、他人の依頼IDでは付けられない", async () => {
    const { project, group, lineOne } = await setupProject("保留5");
    const a = await requestTo(group.id, "保留5社A", "hold5a@example.com", [lineOne]);

    await expect(
      markLine(
        { projectId: project.id, lineItemId: lineOne, quoteGroupRequestId: a.id, status: "on_hold" },
        OWNER_B,
      ),
    ).rejects.toThrow("依頼が見つかりません。");
  });
});
