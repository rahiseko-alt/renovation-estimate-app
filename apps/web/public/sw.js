// アプリの殻だけをキャッシュするサービスワーカー。
//
// この段階では見積のデータをキャッシュしない。金額を扱うものを中途半端に
// オフライン化すると、古い数字を新しい数字だと思って使う事故が起きる。
// データのオフライン対応は写真の回（フェーズ2）で、保存待ちを明示する形で入れる。

const CACHE_NAME = "rea-shell-v1";
const SHELL_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll は1件でも失敗すると全体が失敗し、殻のキャッシュが何も残らない。
      // URLごとに独立させ、1件のミスで全部を失わないようにする。
      Promise.allSettled(SHELL_URLS.map((url) => cache.add(url))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // 取得以外（送信）はキャッシュに触らせない。見積の保存を横取りしない。
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 画面遷移だけを対象にする。通信できないときに殻を出して「開かない」を防ぐ。
  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(async () => {
      // "/" はログイン状態で表示が変わる。それをオフラインの代わりに出すと、
      // ログアウト後もキャッシュ済みの「ログイン中の見た目」が復活しかねない。
      // ログイン状態を持たない専用ページだけを返す。
      const cached = await caches.match("/offline");
      if (cached) return cached;
      return new Response("オフラインです。電波の届く場所で開き直してください。", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }),
  );
});
