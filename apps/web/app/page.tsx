import { HomeScreen } from "../components/HomeScreen";
import { getCurrentUser } from "../lib/auth/server";
import { logout } from "./login/actions";

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <HomeScreen
      loggedIn={user !== null}
      onLogout={logout}
    />
  );
}
