// ============================================================
// 메인 앱 로직 (일감 목록 / 신청 / 마이페이지 / 관리자)
// index.html 전용. Firebase Auth + Firestore 사용.
// ============================================================
import { auth, db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  arrayUnion,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleSignup, handleLogin, handleLogout } from "./auth.js";

let currentUser = null;
let currentRole = "user";
let jobsCache = [];
let userAppsCache = [];
let userAppsUnsub = null;

// ---------- 인증 상태 반영 ----------
export function setCurrentUser(user, role) {
  currentUser = user;
  currentRole = role;

  if (userAppsUnsub) {
    userAppsUnsub();
    userAppsUnsub = null;
  }
  userAppsCache = [];

  if (user) {
    const q = query(collection(db, "applications"), where("userId", "==", user.uid));
    userAppsUnsub = onSnapshot(q, (snap) => {
      userAppsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderJobs(jobsCache);
    });
  }
  renderJobs(jobsCache);
}

// ---------- 일감 목록 ----------
export function initJobsListener() {
  const q = query(collection(db, "jobs"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    jobsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderJobs(jobsCache);
  });
}

function tagColorFor(category) {
  if (category.includes("방문")) return "bg-orange-50 text-orange-600 border-orange-200/50";
  if (category.includes("카카오맵")) return "bg-amber-50 text-amber-700 border-amber-200/50";
  if (category.includes("영수증")) return "bg-emerald-50 text-emerald-700 border-emerald-200/50";
  return "bg-sky-50 text-sky-600 border-sky-200/50";
}

export function renderJobs(jobArray) {
  const container = document.getElementById("jobList");
  if (!container) return;
  container.innerHTML = "";

  if (!jobArray.length) {
    container.innerHTML = `<p class="col-span-full text-center text-slate-400 py-10">등록된 일감이 없습니다. 관리자가 곧 새 일감을 등록할 예정입니다.</p>`;
    return;
  }

  jobArray.forEach((job) => {
    const tagColor = tagColorFor(job.category);
    let myAppCount = 0;
    if (currentUser) {
      myAppCount = userAppsCache.filter((a) => a.jobId === job.id).length;
    }

    const cardHTML = `
      <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition">
        <div class="flex justify-between items-start mb-3">
          <span class="${tagColor} text-xs font-bold px-2.5 py-1 rounded-md border">${job.category}</span>
          ${myAppCount > 0 ? `<span class="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded font-bold">${myAppCount}개 계정 신청중</span>` : ""}
        </div>
        <h3 class="font-bold text-slate-800 text-base mb-2">${job.title}</h3>
        <p class="text-slate-500 text-xs mb-4 line-clamp-2">${job.desc}</p>
        <div class="flex items-center justify-between border-t border-slate-100 pt-3">
          <div>
            <span class="text-xs text-slate-400 block">리워드</span>
            <span class="text-base font-extrabold text-indigo-600">${Number(job.reward).toLocaleString()} P</span>
          </div>
          <button data-job-id="${job.id}" class="apply-btn bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition">
            신청하기
          </button>
        </div>
      </div>
    `;
    container.insertAdjacentHTML("beforeend", cardHTML);
  });

  container.querySelectorAll(".apply-btn").forEach((btn) => {
    btn.addEventListener("click", () => openApplyModal(btn.dataset.jobId));
  });
}

export function filterCategory(cat) {
  if (cat === "전체") renderJobs(jobsCache);
  else renderJobs(jobsCache.filter((j) => j.category === cat));
}

// ---------- 일감 신청 ----------
export async function openApplyModal(jobId) {
  if (!currentUser) {
    alert("로그인이 필요한 서비스입니다.");
    openModal("loginModal");
    return;
  }

  const job = jobsCache.find((j) => j.id === jobId);
  if (!job) return;

  document.getElementById("applyJobId").value = jobId;
  document.getElementById("applyJobTitle").innerText = `[${job.category}] ${job.title}`;

  const userSnap = await getDoc(doc(db, "users", currentUser.uid));
  const subAccounts = userSnap.exists() ? userSnap.data().subAccounts || [] : [];

  const select = document.getElementById("applyAccountSelect");
  select.innerHTML = "";

  if (!subAccounts.length) {
    select.insertAdjacentHTML("beforeend", `<option value="">등록된 계정이 없습니다</option>`);
  }

  subAccounts.forEach((acc) => {
    const already = userAppsCache.find((a) => a.jobId === jobId && a.subAccount === acc);
    const disabledStr = already ? "disabled" : "";
    const labelStr = already ? `${acc} (이미 신청됨)` : acc;
    select.insertAdjacentHTML("beforeend", `<option value="${acc}" ${disabledStr}>${labelStr}</option>`);
  });

  openModal("applyModal");
}

export async function handleJobApplySubmit(e) {
  e.preventDefault();
  const jobId = document.getElementById("applyJobId").value;
  const subAccount = document.getElementById("applyAccountSelect").value;

  if (!subAccount) {
    alert("신청 가능한 계정이 없습니다. 마이페이지에서 계정을 추가해 주세요.");
    return;
  }

  await addDoc(collection(db, "applications"), {
    userId: currentUser.uid,
    userName: currentUser.displayName || currentUser.email,
    jobId,
    subAccount,
    status: "신청완료",
    url: "",
    createdAt: Date.now(),
  });

  alert(`[${subAccount}] 계정으로 일감 신청이 완료되었습니다!`);
  closeModal("applyModal");
  e.target.reset();
}

// ---------- 마이페이지 ----------
export async function openMyPage() {
  if (!currentUser) return;

  document.getElementById("myPageUserInfo").innerText =
    `계정: ${currentUser.email} | 회원 유형: ${currentRole === "admin" ? "관리자" : "일반 리뷰어"}`;

  const userSnap = await getDoc(doc(db, "users", currentUser.uid));
  const subAccounts = userSnap.exists() ? userSnap.data().subAccounts || [] : [];

  const accContainer = document.getElementById("subAccountList");
  accContainer.innerHTML = "";
  subAccounts.forEach((acc) => {
    accContainer.insertAdjacentHTML(
      "beforeend",
      `<span class="bg-white border border-slate-200 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-lg shadow-sm">👤 ${acc}</span>`
    );
  });

  const tbody = document.getElementById("myApplicationsTable");
  tbody.innerHTML = "";

  if (!userAppsCache.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">신청한 일감이 없습니다.</td></tr>`;
  } else {
    userAppsCache.forEach((app) => {
      const job = jobsCache.find((j) => j.id === app.jobId);

      let statusBadge = "";
      if (app.status === "신청완료") statusBadge = `<span class="bg-slate-100 text-slate-700 text-[11px] font-bold px-2 py-1 rounded">신청완료</span>`;
      else if (app.status === "제출완료") statusBadge = `<span class="bg-blue-100 text-blue-700 text-[11px] font-bold px-2 py-1 rounded">📤 제출완료</span>`;
      else if (app.status === "승인완료") statusBadge = `<span class="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-1 rounded">✅ 승인완료</span>`;
      else if (app.status === "반려됨") statusBadge = `<span class="bg-rose-100 text-rose-700 text-[11px] font-bold px-2 py-1 rounded">반려됨</span>`;

      let actionBtn = "";
      if (app.status === "신청완료") {
        actionBtn = `<button data-app-id="${app.id}" class="submit-btn bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1 rounded text-xs transition">제출하기</button>`;
      } else {
        actionBtn = `<span class="text-slate-400 text-[11px]">제출 완료됨</span>`;
      }

      tbody.insertAdjacentHTML(
        "beforeend",
        `<tr>
          <td class="p-3 font-semibold text-slate-800">${job ? job.title : "일감"}</td>
          <td class="p-3 font-medium text-slate-600">${app.subAccount}</td>
          <td class="p-3 font-bold text-indigo-600">${job ? Number(job.reward).toLocaleString() : 0} P</td>
          <td class="p-3">${statusBadge}</td>
          <td class="p-3 text-right">${actionBtn}</td>
        </tr>`
      );
    });

    tbody.querySelectorAll(".submit-btn").forEach((btn) => {
      btn.addEventListener("click", () => openSubmitModalById(btn.dataset.appId));
    });
  }

  openModal("myPageModal");
}

export async function addSubAccount(e) {
  e.preventDefault();
  const input = document.getElementById("subAccName");
  const accName = input.value.trim();
  if (!accName) return;

  const userRef = doc(db, "users", currentUser.uid);
  const userSnap = await getDoc(userRef);
  const existing = userSnap.exists() ? userSnap.data().subAccounts || [] : [];

  if (existing.includes(accName)) {
    alert("이미 등록된 계정 이름입니다.");
    return;
  }

  await updateDoc(userRef, { subAccounts: arrayUnion(accName) });
  input.value = "";
  openMyPage();
}

// ---------- 제출(URL) ----------
export function openSubmitModalById(appId) {
  const app = userAppsCache.find((a) => a.id === appId);
  if (!app) return;
  const job = jobsCache.find((j) => j.id === app.jobId);

  document.getElementById("submitAppId").value = appId;
  document.getElementById("submitJobTitle").innerText = `[${app.subAccount}] 계정으로 제출 - ${job ? job.title : "일감"}`;
  closeModal("myPageModal");
  openModal("submitModal");
}

export async function handleJobSubmission(e) {
  e.preventDefault();
  const appId = document.getElementById("submitAppId").value;
  const url = document.getElementById("submitUrl").value;

  await updateDoc(doc(db, "applications", appId), {
    status: "제출완료",
    url,
    submittedAt: Date.now(),
  });

  alert("제출이 완료되었습니다. 관리자 검수 후 승인 처리됩니다.");
  closeModal("submitModal");
  e.target.reset();
}

// ---------- 관리자: 제출 관리 ----------
export async function openAdminSubmitManager() {
  if (currentRole !== "admin") {
    alert("관리자 전용 기능입니다.");
    return;
  }

  const snap = await getDocs(collection(db, "applications"));
  const submittedApps = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((a) => a.status !== "신청완료")
    .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));

  const tbody = document.getElementById("adminSubmitTable");
  tbody.innerHTML = "";

  if (!submittedApps.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">제출된 내역이 없습니다.</td></tr>`;
  } else {
    submittedApps.forEach((app) => {
      const job = jobsCache.find((j) => j.id === app.jobId);
      tbody.insertAdjacentHTML(
        "beforeend",
        `<tr>
          <td class="p-2.5 font-bold text-slate-700">${app.userName || app.userId}<br><span class="text-[10px] text-indigo-600">(${app.subAccount})</span></td>
          <td class="p-2.5 text-slate-700">${job ? job.title : "일감"}</td>
          <td class="p-2.5">
            ${app.url ? `<a href="${app.url}" target="_blank" rel="noopener" class="text-indigo-600 underline">링크확인</a>` : ""}
          </td>
          <td class="p-2.5 font-bold text-slate-800">${app.status}</td>
          <td class="p-2.5 text-right space-x-1">
            <button data-app-id="${app.id}" data-status="승인완료" class="status-btn bg-emerald-600 text-white px-2 py-1 rounded text-[10px] font-bold">승인</button>
            <button data-app-id="${app.id}" data-status="반려됨" class="status-btn bg-rose-500 text-white px-2 py-1 rounded text-[10px] font-bold">반려</button>
          </td>
        </tr>`
      );
    });

    tbody.querySelectorAll(".status-btn").forEach((btn) => {
      btn.addEventListener("click", () => changeStatus(btn.dataset.appId, btn.dataset.status));
    });
  }

  openModal("adminSubmitModal");
}

export async function changeStatus(appId, newStatus) {
  if (currentRole !== "admin") return;
  await updateDoc(doc(db, "applications", appId), { status: newStatus });
  alert(`상태가 [${newStatus}]로 변경되었습니다.`);
  openAdminSubmitManager();
}

// ---------- 관리자: 일감 등록 ----------
export async function addNewJob(e) {
  e.preventDefault();
  if (currentRole !== "admin") {
    alert("관리자만 일감을 등록할 수 있습니다.");
    return;
  }

  await addDoc(collection(db, "jobs"), {
    category: document.getElementById("jobCategory").value,
    title: document.getElementById("jobTitle").value,
    desc: document.getElementById("jobDesc").value,
    reward: Number(document.getElementById("jobReward").value),
    createdAt: Date.now(),
  });

  closeModal("addJobModal");
  e.target.reset();
  alert("새로운 일감이 등록되었습니다.");
}

// ---------- 로그인/회원가입 폼 핸들러 ----------
export async function onSignupSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("signupName").value;
  const email = document.getElementById("signupEmail").value;
  const pw = document.getElementById("signupPw").value;

  try {
    await handleSignup(name, email, pw);
    alert("회원가입이 완료되었습니다! 자동으로 로그인됩니다.");
    closeModal("signupModal");
    e.target.reset();
  } catch (err) {
    alert(authErrorMessage(err));
  }
}

export async function onLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value;
  const pw = document.getElementById("loginPw").value;

  try {
    await handleLogin(email, pw);
    closeModal("loginModal");
    e.target.reset();
  } catch (err) {
    alert(authErrorMessage(err));
  }
}

function authErrorMessage(err) {
  const code = err.code || "";
  if (code.includes("email-already-in-use")) return "이미 가입된 이메일입니다.";
  if (code.includes("weak-password")) return "비밀번호는 6자 이상이어야 합니다.";
  if (code.includes("invalid-email")) return "이메일 형식이 올바르지 않습니다.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "이메일 또는 비밀번호가 일치하지 않습니다.";
  return "오류가 발생했습니다: " + code;
}

// ---------- 모달 공통 ----------
export function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
}
export function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}
