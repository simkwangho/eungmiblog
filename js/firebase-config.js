// ============================================================
// Firebase 프로젝트 설정
// 1. https://console.firebase.google.com 에서 새 프로젝트를 만드세요.
// 2. 프로젝트 설정 > 일반 > 내 앱 > 웹 앱 추가 후 아래 firebaseConfig 값을
//    발급받은 값으로 교체하세요.
// 3. Authentication > Sign-in method 에서 "이메일/비밀번호"를 사용 설정하세요.
// 4. Firestore Database를 생성하세요 (프로덕션 모드 권장, 규칙은 firestore.rules 참고).
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD84yvYbYiJP1Rs6SQsi9g08qsFCedZrYQ",
  authDomain: "eungmiday.firebaseapp.com",
  projectId: "eungmiday",
  storageBucket: "eungmiday.firebasestorage.app",
  messagingSenderId: "130046026135",
  appId: "1:130046026135:web:ed2ff5e9c6ae7f3a70a4d2",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
