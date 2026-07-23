// ============================================================
// 인증(로그인/회원가입/로그아웃) 공용 로직
// 모든 페이지의 상단 내비게이션(로그인 상태 표시)에서 공통으로 사용합니다.
// ============================================================
import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 로그인 상태에 따라 상단 내비게이션(로그인/마이페이지 버튼, 관리자 메뉴)을 갱신합니다.
export function watchAuthState(onChange) {
  onAuthStateChanged(auth, async (user) => {
    const loggedOut = document.getElementById("authLoggedOut");
    const loggedIn = document.getElementById("authLoggedIn");
    const adminMenu = document.getElementById("adminMenu");
    const navUserName = document.getElementById("navUserName");

    let role = "user";

    if (user) {
      const snap = await getDoc(doc(db, "users", user.uid));
      const data = snap.exists() ? snap.data() : {};

      if (data.withdrawn) {
        await signOut(auth);
        alert("탈퇴 처리된 계정입니다. 문의사항은 문의 페이지로 연락해 주세요.");
        return;
      }

      if (loggedOut) loggedOut.classList.add("hidden");
      if (loggedIn) loggedIn.classList.remove("hidden");
      if (navUserName) navUserName.textContent = user.displayName || user.email;

      role = data.role || "user";

      if (adminMenu) {
        if (role === "admin") adminMenu.classList.remove("hidden");
        else adminMenu.classList.add("hidden");
      }
    } else {
      if (loggedOut) loggedOut.classList.remove("hidden");
      if (loggedIn) loggedIn.classList.add("hidden");
      if (adminMenu) adminMenu.classList.add("hidden");
    }

    if (typeof onChange === "function") onChange(user, role);
  });
}

export async function handleSignup(name, nickname, phone, email, pw) {
  const cred = await createUserWithEmailAndPassword(auth, email, pw);
  await updateProfile(cred.user, { displayName: nickname });
  await setDoc(doc(db, "users", cred.user.uid), {
    name,
    nickname,
    phone,
    email,
    role: "user",
    createdAt: Date.now(),
  });
  return cred.user;
}

export function handleLogin(email, pw) {
  return signInWithEmailAndPassword(auth, email, pw);
}

export function handleLogout() {
  return signOut(auth);
}

// 내비게이션의 로그아웃 버튼(id="navLogoutBtn")이 있는 모든 페이지에서 자동으로 동작을 연결합니다.
export function wireLogoutButton() {
  const btn = document.getElementById("navLogoutBtn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    await handleLogout();
    alert("로그아웃 되었습니다.");
    if (location.pathname.includes("/guides/") || !location.pathname.endsWith("index.html")) {
      // 콘텐츠 페이지에서는 새로고침만 해서 상태를 갱신합니다.
      location.reload();
    }
  });
}
