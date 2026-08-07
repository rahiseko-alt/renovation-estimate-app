import { HomeScreen } from "../components/HomeScreen";
import { isDemoOwner } from "../lib/auth/demoOwner";
import { getCurrentUser } from "../lib/auth/server";
import { logout } from "./login/actions";

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <HomeScreen
      loggedIn={user !== null}
      demoVisitor={user !== null && isDemoOwner(user)}
      onLogout={logout}
    />
  );
}
