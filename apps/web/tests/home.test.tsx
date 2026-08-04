import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "../app/page";
import { HOME_HEADING } from "../lib/content";

// Home はクライアントコンポーネント。データは useEffect 内でブラウザの
// localStorage から読むため、サーバー側の初回レンダリング（このテストが検証する範囲）
// では見出しのみが出る。この見出しは CI スモーク（ci.yml / prod-smoke.yml）が
// 到達性確認に使うマーカーでもある。
describe("Home page (initial server render)", () => {
  it("renders the heading before client data loads", () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain(HOME_HEADING);
  });
});
