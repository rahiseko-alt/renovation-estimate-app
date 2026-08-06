import { HomeScreen } from "../components/HomeScreen";
import { getCurrentUser } from "../lib/auth/server";
import { startDemoAction } from "./demo/actions";
import { logout } from "./login/actions";

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <HomeScreen
      loggedIn={user !== null}
      onLogout={logout}
      onStartDemo={startDemoAction}
    />
  );
}
