import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeScreen } from "../components/HomeScreen";
import { AUTH_TEXT, HOME_HEADING, HOME_STEPS } from "../lib/content";

async function noop(): Promise<void> {}

describe("HomeScreen", () => {
  it("見出しを出す（CI スモークが本文で探すマーカー）", () => {
    const html = renderToStaticMarkup(
      <HomeScreen loggedIn={false} onLogout={noop} />,
    );
    expect(html).toContain(HOME_HEADING);
  });

  it("未ログインなら作業の流れを見せず、ログインへ誘導する", () => {
    const html = renderToStaticMarkup(
      <HomeScreen loggedIn={false} onLogout={noop} />,
    );
    expect(html).toContain('href="/login"');
    for (const step of HOME_STEPS) {
      expect(html).not.toContain(step.label);
    }
  });

  it("ログイン済みなら作業の流れとログアウトを出す", () => {
    const html = renderToStaticMarkup(
      <HomeScreen loggedIn onLogout={noop} />,
    );
    for (const step of HOME_STEPS) {
      expect(html).toContain(step.label);
    }
    expect(html).toContain(AUTH_TEXT.logout);
  });
});
