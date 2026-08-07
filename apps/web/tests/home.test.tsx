import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeScreen } from "../components/HomeScreen";
import {
  AUTH_TEXT,
  DEVELOPER_PANEL_TEXT,
  HOME_DESTINATIONS,
  HOME_HEADING,
} from "../lib/content";
import { DEMO_ENTRY_TEXT, DEMO_START_PATH } from "../lib/demoText";

async function noop(): Promise<void> {}

/** ログイン状態の2通り。**表に出るものはどちらでも同じ**であることを見るために使う。 */
const BOTH_STATES = [
  { label: "未ログイン", loggedIn: false },
  { label: "ログイン済み", loggedIn: true },
] as const;

describe("HomeScreen", () => {
  it("見出しを出す（CI スモークが本文で探すマーカー）", () => {
    const html = renderToStaticMarkup(
      <HomeScreen loggedIn={false} onLogout={noop} />,
    );
    expect(html).toContain(HOME_HEADING);
  });

  /**
   * **ログイン状態で出し分けない。**
   * 以前は出し分けていて、デモを一度触った人（デモのセッションを持つ人）に
   * デモの入口が出なくなり、商談で見せ直せなかった
   * （docs/failures.md 2026-08-06）。出し分けをやめれば再発しない。
   */
  for (const state of BOTH_STATES) {
    it(`${state.label}でもデモの入口を出す（トップは常に同じ）`, () => {
      const html = renderToStaticMarkup(
        <HomeScreen loggedIn={state.loggedIn} onLogout={noop} />,
      );
      expect(html).toContain(DEMO_ENTRY_TEXT.start);
      // **素のフォームとして POST すること。** Server Action にすると呼び出し先IDが
      // ビルドごとに変わり、古いページを開いたままのブラウザから押しても無反応になる
      // （実際に起きた。app/demo/start/route.ts の冒頭）。
      expect(html).toContain(`method="post"`);
      expect(html).toContain(`action="${DEMO_START_PATH}"`);
    });

    it(`${state.label}でも、作る側の行き先は引き出しの中に隠す`, () => {
      const html = renderToStaticMarkup(
        <HomeScreen loggedIn={state.loggedIn} onLogout={noop} />,
      );
      // 引き出しは <details>。閉じた状態で描かれる（open が付かない）。
      expect(html).toContain("<details");
      expect(html).not.toContain("<details open");
      expect(html).toContain(DEVELOPER_PANEL_TEXT.open);
      // デモの入口より後ろに置かない（最初に目に入るのはデモであるべき）が、
      // 位置そのものは見出しの右上なので、ここでは「引き出しの中にある」だけを見る。
    });
  }

  it("ログイン済みなら、引き出しの中に行き先とログアウトが入る", () => {
    const html = renderToStaticMarkup(<HomeScreen loggedIn onLogout={noop} />);
    for (const destination of HOME_DESTINATIONS) {
      expect(html).toContain(destination.label);
      expect(html).toContain(`href="${destination.href}"`);
    }
    expect(html).toContain(AUTH_TEXT.logout);
  });

  it("未ログインなら、引き出しの中はログインへの誘導だけ", () => {
    const html = renderToStaticMarkup(
      <HomeScreen loggedIn={false} onLogout={noop} />,
    );
    expect(html).toContain('href="/login"');
    expect(html).not.toContain(AUTH_TEXT.logout);
    for (const destination of HOME_DESTINATIONS) {
      expect(html).not.toContain(`href="${destination.href}"`);
    }
  });
});

describe("HOME_DESTINATIONS", () => {
  // 以前ここには4ステップが並んでいたが、**4つとも /projects を指していた**。
  // 押しても行き先が変わらず、作り直しで増えた画面は1つも出てこないまま
  // 本番に出ていた。同じことが起きたら落ちるようにする。
  it("行き先が重複していない", () => {
    const hrefs = HOME_DESTINATIONS.map((destination) => destination.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
