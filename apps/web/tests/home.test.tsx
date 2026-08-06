import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeScreen } from "../components/HomeScreen";
import { AUTH_TEXT, HOME_DESTINATIONS, HOME_HEADING } from "../lib/content";
import { DEMO_ENTRY_TEXT } from "../lib/demoText";

async function noop(): Promise<void> {}

describe("HomeScreen", () => {
  it("見出しを出す（CI スモークが本文で探すマーカー）", () => {
    const html = renderToStaticMarkup(
      <HomeScreen loggedIn={false} onLogout={noop} onStartDemo={noop} />,
    );
    expect(html).toContain(HOME_HEADING);
  });

  it("未ログインなら行き先を見せず、ログインへ誘導する", () => {
    const html = renderToStaticMarkup(
      <HomeScreen loggedIn={false} onLogout={noop} onStartDemo={noop} />,
    );
    expect(html).toContain('href="/login"');
    for (const destination of HOME_DESTINATIONS) {
      expect(html).not.toContain(destination.label);
    }
  });

  // 商談で見せる相手はアカウントを持っていない。ログインが最初に来ると必ず止まる。
  it("未ログインならデモの入口を出す", () => {
    const html = renderToStaticMarkup(
      <HomeScreen loggedIn={false} onLogout={noop} onStartDemo={noop} />,
    );
    expect(html).toContain(DEMO_ENTRY_TEXT.start);
    // デモの入口がログインより先に出る（押す順が逆だとデモにたどり着けない）。
    expect(html.indexOf(DEMO_ENTRY_TEXT.start)).toBeLessThan(
      html.indexOf(AUTH_TEXT.submit),
    );
  });

  it("ログイン済みにはデモの入口を出さない（実データの画面に混ぜない）", () => {
    const html = renderToStaticMarkup(
      <HomeScreen loggedIn onLogout={noop} onStartDemo={noop} />,
    );
    expect(html).not.toContain(DEMO_ENTRY_TEXT.start);
  });

  it("ログイン済みなら行き先とログアウトを出す", () => {
    const html = renderToStaticMarkup(<HomeScreen loggedIn onLogout={noop} onStartDemo={noop} />);
    for (const destination of HOME_DESTINATIONS) {
      expect(html).toContain(destination.label);
      expect(html).toContain(`href="${destination.href}"`);
    }
    expect(html).toContain(AUTH_TEXT.logout);
  });
});

describe("HOME_DESTINATIONS", () => {
  // 以前ここには4ステップが並んでいたが、**4つとも /projects を指していた**。
  // 押しても行き先が変わらず、作り直しで増えた画面は1つも出てこないまま
  // 本番に出ていた。同じことが起きたら落ちるようにする。
  it("同じ行き先が2つ以上並んでいない", () => {
    const hrefs = HOME_DESTINATIONS.map((destination) => destination.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("案件を選ばずに開ける入口だけが並んでいる（案件IDを要する行き先を置かない）", () => {
    for (const destination of HOME_DESTINATIONS) {
      expect(destination.href.startsWith("/")).toBe(true);
      expect(destination.href).not.toContain("[");
      expect(destination.href).not.toMatch(/^\/projects\/./);
    }
  });

  it("作り直しで増えた画面へ行ける（下請台帳・会社設定）", () => {
    const hrefs = HOME_DESTINATIONS.map((destination) => destination.href);
    expect(hrefs).toContain("/subcontractors");
    expect(hrefs).toContain("/settings/company");
  });
});
