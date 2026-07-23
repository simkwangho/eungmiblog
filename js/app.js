// ============================================================
// 메인 앱 로직 (일감 목록 / 신청 / 마이페이지 / 관리자)
// index.html 전용. Firebase Auth + Firestore 사용.
// ============================================================
import { auth, db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleSignup, handleLogin, handleLogout } from "./auth.js";

let currentUser = null;
let currentRole = "user";
let jobsCache = [];
let userAppsCache = [];
let userAppsUnsub = null;
let userSubAccountsCache = [];
let userSubAccountsUnsub = null;

// ---------- 인증 상태 반영 ----------
export function setCurrentUser(user, role) {
  currentUser = user;
  currentRole = role;

  const myPageLabel = document.getElementById("navMyPageLabel");
  if (myPageLabel) myPageLabel.textContent = role === "admin" ? "관리자페이지" : "마이페이지";

  if (userAppsUnsub) {
    userAppsUnsub();
    userAppsUnsub = null;
  }
  if (userSubAccountsUnsub) {
    userSubAccountsUnsub();
    userSubAccountsUnsub = null;
  }
  userAppsCache = [];
  userSubAccountsCache = [];

  if (user) {
    const appsQ = query(collection(db, "applications"), where("userId", "==", user.uid));
    userAppsUnsub = onSnapshot(appsQ, (snap) => {
      userAppsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderJobs(jobsCache);
    });

    const subsQ = query(collection(db, "subAccounts"), where("userId", "==", user.uid));
    userSubAccountsUnsub = onSnapshot(subsQ, (snap) => {
      userSubAccountsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
  if (category.includes("당근")) return "bg-orange-50 text-orange-600 border-orange-200/50";
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
        ${
          currentRole === "admin"
            ? `<div class="flex gap-1.5 mt-3 pt-3 border-t border-slate-100">
                <button data-job-id="${job.id}" class="edit-job-btn flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold py-1.5 rounded-lg transition">✏️ 수정</button>
                <button data-job-id="${job.id}" class="delete-job-btn flex-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[11px] font-bold py-1.5 rounded-lg transition">🗑️ 삭제</button>
              </div>`
            : ""
        }
      </div>
    `;
    container.insertAdjacentHTML("beforeend", cardHTML);
  });

  container.querySelectorAll(".apply-btn").forEach((btn) => {
    btn.addEventListener("click", () => openApplyModal(btn.dataset.jobId));
  });
  container.querySelectorAll(".edit-job-btn").forEach((btn) => {
    btn.addEventListener("click", () => openEditJobModal(btn.dataset.jobId));
  });
  container.querySelectorAll(".delete-job-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteJob(btn.dataset.jobId));
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

  const approvedAccounts = userSubAccountsCache.filter((a) => a.status === "승인됨");

  const select = document.getElementById("applyAccountSelect");
  select.innerHTML = "";

  if (!approvedAccounts.length) {
    select.insertAdjacentHTML(
      "beforeend",
      `<option value="">승인된 계정이 없습니다 (마이페이지에서 계정 등록 후 승인 대기)</option>`
    );
  }

  approvedAccounts.forEach((acc) => {
    const already = userAppsCache.find((a) => a.jobId === jobId && a.subAccount === acc.name);
    const disabledStr = already ? "disabled" : "";
    const labelStr = already ? `${acc.name} (이미 신청됨)` : acc.name;
    select.insertAdjacentHTML("beforeend", `<option value="${acc.name}" ${disabledStr}>${labelStr}</option>`);
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

// ---------- 상태 배지 공통 ----------
function statusBadgeHTML(status) {
  if (status === "신청완료") return `<span class="bg-slate-100 text-slate-700 text-[11px] font-bold px-2 py-1 rounded">신청완료</span>`;
  if (status === "제출완료") return `<span class="bg-blue-100 text-blue-700 text-[11px] font-bold px-2 py-1 rounded">📤 검수중</span>`;
  if (status === "정산예정") return `<span class="bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-1 rounded">💰 정산예정</span>`;
  if (status === "정산완료") return `<span class="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-1 rounded">✅ 정산완료</span>`;
  if (status === "반려됨") return `<span class="bg-rose-100 text-rose-700 text-[11px] font-bold px-2 py-1 rounded">반려됨</span>`;
  return "";
}

// ---------- 마이페이지 ----------
export async function openMyPage() {
  if (!currentUser) return;

  if (currentRole === "admin") {
    return openAdminDashboard();
  }

  document.getElementById("myPageUserInfo").innerText =
    `계정: ${currentUser.email} | 회원 유형: 일반 리뷰어`;

  const accContainer = document.getElementById("subAccountList");
  accContainer.innerHTML = "";

  if (!userSubAccountsCache.length) {
    accContainer.innerHTML = `<span class="text-xs text-slate-400">등록된 계정이 없습니다. 아래에서 추가해 보세요.</span>`;
  } else {
    userSubAccountsCache.forEach((acc) => {
      let statusTag = "";
      if (acc.status === "대기") statusTag = `<span class="text-amber-600">(승인 대기)</span>`;
      else if (acc.status === "승인됨") statusTag = `<span class="text-emerald-600">(승인됨)</span>`;
      else if (acc.status === "거절됨") statusTag = `<span class="text-rose-600">(거절됨)</span>`;

      accContainer.insertAdjacentHTML(
        "beforeend",
        `<span class="bg-white border border-slate-200 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-lg shadow-sm inline-flex items-center gap-1">
          👤 ${acc.name} ${statusTag}
          <button data-sub-id="${acc.id}" class="del-sub-btn text-slate-400 hover:text-rose-600 font-bold ml-1">✕</button>
        </span>
        ${acc.status === "거절됨" && acc.rejectReason ? `<div class="w-full text-[11px] text-rose-500 mt-0.5">사유: ${acc.rejectReason}</div>` : ""}`
      );
    });
  }

  accContainer.querySelectorAll(".del-sub-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteSubAccount(btn.dataset.subId));
  });

  const tbody = document.getElementById("myApplicationsTable");
  tbody.innerHTML = "";

  if (!userAppsCache.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">신청한 일감이 없습니다.</td></tr>`;
  } else {
    userAppsCache.forEach((app) => {
      const job = jobsCache.find((j) => j.id === app.jobId);
      const rejectNote =
        app.status === "반려됨" && app.rejectReason
          ? `<div class="text-[11px] text-rose-500 mt-1">사유: ${app.rejectReason}</div>`
          : "";

      let actionBtn = "";
      if (app.status === "신청완료") {
        actionBtn = `<button data-app-id="${app.id}" class="submit-btn bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1 rounded text-xs transition">제출하기</button>`;
      } else if (app.status === "반려됨") {
        actionBtn = `<button data-app-id="${app.id}" class="submit-btn bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1 rounded text-xs transition">재제출</button>`;
      } else {
        actionBtn = `<span class="text-slate-400 text-[11px]">-</span>`;
      }

      tbody.insertAdjacentHTML(
        "beforeend",
        `<tr>
          <td class="p-3 font-semibold text-slate-800">${job ? job.title : "일감"}</td>
          <td class="p-3 font-medium text-slate-600">${app.subAccount}</td>
          <td class="p-3 font-bold text-indigo-600">${job ? Number(job.reward).toLocaleString() : 0} P</td>
          <td class="p-3">${statusBadgeHTML(app.status)}${rejectNote}</td>
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
  const nameInput = document.getElementById("subAccName");
  const linkInput = document.getElementById("subAccLink");
  const name = nameInput.value.trim();
  const link = linkInput.value.trim();
  if (!name || !link) return;

  await addDoc(collection(db, "subAccounts"), {
    userId: currentUser.uid,
    userName: currentUser.displayName || currentUser.email,
    name,
    link,
    status: "대기",
    rejectReason: "",
    createdAt: Date.now(),
  });

  nameInput.value = "";
  linkInput.value = "";
  alert("계정이 등록되었습니다. 관리자 승인 후 일감 신청에 사용할 수 있습니다.");
  openMyPage();
}

export async function deleteSubAccount(subId) {
  if (!confirm("이 계정을 삭제하시겠습니까?")) return;
  await deleteDoc(doc(db, "subAccounts", subId));
  openMyPage();
}

// ---------- 관리자페이지 (리뷰어별 정산 현황 대시보드) ----------
function accountIcon(name) {
  if (name.includes("영수증")) return "🧾";
  if (name.includes("당근")) return "🥕";
  if (name.includes("카카오맵")) return "📍";
  if (name.includes("블로그")) return "✍️";
  return "📱";
}

export async function openAdminDashboard() {
  if (currentRole !== "admin") return;

  document.getElementById("adminDashboardAdminInfo").innerText =
    `총괄관리자: ${currentUser.displayName || currentUser.email} (${currentUser.email})`;

  await Promise.all([fetchAllUsers(), fetchAllApplications(), fetchAllSubAccounts()]);

  const reviewers = allUsersCache.filter((u) => u.role !== "admin");
  const select = document.getElementById("adminDashboardReviewerSelect");
  select.innerHTML = "";

  if (!reviewers.length) {
    select.insertAdjacentHTML("beforeend", `<option value="">등록된 리뷰어가 없습니다</option>`);
  } else {
    reviewers.forEach((u) => {
      const label = `${u.name || u.email}${u.nickname ? ` (${u.nickname})` : ""}`;
      select.insertAdjacentHTML("beforeend", `<option value="${u.id}">${label}</option>`);
    });
  }

  renderAdminDashboardFor(reviewers[0]?.id || "");
  openModal("adminDashboardModal");
}

export function switchAdminDashboardReviewer() {
  const uid = document.getElementById("adminDashboardReviewerSelect").value;
  renderAdminDashboardFor(uid);
}

function renderAdminDashboardFor(uid) {
  const apps = allAppsCache.filter((a) => a.userId === uid);

  const pendingPoints = apps
    .filter((a) => a.status === "정산예정")
    .reduce((sum, a) => sum + (jobsCache.find((j) => j.id === a.jobId)?.reward || 0), 0);
  const settledPoints = apps
    .filter((a) => a.status === "정산완료")
    .reduce((sum, a) => sum + (jobsCache.find((j) => j.id === a.jobId)?.reward || 0), 0);

  document.getElementById("dashPendingPoints").textContent = `${pendingPoints.toLocaleString()} P`;
  document.getElementById("dashSettledPoints").textContent = `${settledPoints.toLocaleString()} P`;

  const tbody = document.getElementById("dashAppsTable");
  tbody.innerHTML = "";
  const appStatusOrder = { 정산예정: 0, 반려됨: 0, 제출완료: 0, 신청완료: 1, 정산완료: 2 };
  const sortedApps = apps.slice().sort((a, b) => {
    const orderDiff = (appStatusOrder[a.status] ?? 9) - (appStatusOrder[b.status] ?? 9);
    if (orderDiff !== 0) return orderDiff;
    return (b.submittedAt || b.createdAt || 0) - (a.submittedAt || a.createdAt || 0);
  });

  if (!sortedApps.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">신청 내역이 없습니다.</td></tr>`;
  } else {
    sortedApps.forEach((app) => {
      const job = jobsCache.find((j) => j.id === app.jobId);
      tbody.insertAdjacentHTML(
        "beforeend",
        `<tr>
          <td class="p-3 font-semibold text-slate-800">${job ? job.title : "일감"}</td>
          <td class="p-3 font-medium text-slate-600">${app.subAccount}</td>
          <td class="p-3 font-bold text-indigo-600">${job ? Number(job.reward).toLocaleString() : 0} P</td>
          <td class="p-3">${statusBadgeHTML(app.status)}</td>
          <td class="p-3">${app.url ? `<a href="${app.url}" target="_blank" rel="noopener" class="text-indigo-600 underline">링크확인</a>` : "-"}</td>
        </tr>`
      );
    });
  }

  const accounts = allSubAccountsCache.filter((a) => a.userId === uid);

  const summaryContainer = document.getElementById("dashAccountSummary");
  summaryContainer.innerHTML = "";
  const nameGroups = {};
  accounts.forEach((acc) => {
    nameGroups[acc.name] = nameGroups[acc.name] || { approved: 0 };
    if (acc.status === "승인됨") nameGroups[acc.name].approved += 1;
  });
  Object.entries(nameGroups).forEach(([name, counts]) => {
    summaryContainer.insertAdjacentHTML(
      "beforeend",
      `<span class="bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-lg">${accountIcon(name)} ${name}: 승인 ${counts.approved}개</span>`
    );
  });

  const listContainer = document.getElementById("dashAccountList");
  listContainer.innerHTML = "";
  if (!accounts.length) {
    listContainer.innerHTML = `<p class="text-xs text-slate-400">등록된 계정이 없습니다.</p>`;
  } else {
    const statusOrder = { 대기: 0, 거절됨: 1, 승인됨: 2 };
    const sortedAccounts = accounts.slice().sort((a, b) => {
      const orderDiff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      if (orderDiff !== 0) return orderDiff;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });

    sortedAccounts.forEach((acc) => {
      let statusBadge = "";
      if (acc.status === "대기") statusBadge = `<span class="bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-1 rounded">대기중</span>`;
      else if (acc.status === "승인됨") statusBadge = `<span class="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-1 rounded">승인완료</span>`;
      else if (acc.status === "거절됨") statusBadge = `<span class="bg-rose-100 text-rose-700 text-[11px] font-bold px-2 py-1 rounded">거절됨</span>`;

      const registeredDate = acc.createdAt
        ? new Date(acc.createdAt).toLocaleDateString("ko-KR")
        : "-";
      const waitingDays =
        acc.status === "대기" && acc.createdAt
          ? Math.max(0, Math.floor((Date.now() - acc.createdAt) / 86400000))
          : null;

      listContainer.insertAdjacentHTML(
        "beforeend",
        `<div class="bg-white border border-slate-200 rounded-xl p-3">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="font-bold text-slate-800 text-sm">${accountIcon(acc.name)} ${acc.name}</span>
            ${statusBadge}
            <span class="text-[11px] text-slate-400">등록일: ${registeredDate}${waitingDays !== null ? ` · ${waitingDays}일째 대기중` : ""}</span>
          </div>
          <a href="${acc.link}" target="_blank" rel="noopener" class="text-indigo-600 underline text-xs break-all">${acc.link}</a>
          ${acc.status === "거절됨" && acc.rejectReason ? `<div class="text-[11px] text-rose-500 mt-1">사유: ${acc.rejectReason}</div>` : ""}
        </div>`
      );
    });
  }
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
    rejectReason: "",
    submittedAt: Date.now(),
  });

  alert("제출이 완료되었습니다. 관리자 검수 후 정산예정으로 전환됩니다.");
  closeModal("submitModal");
  e.target.reset();
}

// ---------- 관리자 데이터 캐시 & 공용 fetch ----------
let allUsersCache = [];
let allAppsCache = [];
let allSubAccountsCache = [];

async function fetchAllApplications() {
  const snap = await getDocs(collection(db, "applications"));
  allAppsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return allAppsCache;
}

async function fetchAllUsers() {
  const snap = await getDocs(collection(db, "users"));
  allUsersCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return allUsersCache;
}

async function fetchAllSubAccounts() {
  const snap = await getDocs(collection(db, "subAccounts"));
  allSubAccountsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return allSubAccountsCache;
}

// ---------- 관리자: 🛡️ 계정승인 (링크 승인 + 회원 관리) ----------
export async function openAdminAccountModal() {
  if (currentRole !== "admin") {
    alert("관리자 전용 기능입니다.");
    return;
  }

  await Promise.all([fetchAllSubAccounts(), fetchAllUsers(), fetchAllApplications()]);
  renderAccountApprovalTab();
  renderMemberManageTab();
  openModal("adminAccountModal");
}

function renderAccountApprovalTab() {
  const tbody = document.getElementById("accountApprovalTable");
  tbody.innerHTML = "";

  if (!allSubAccountsCache.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">등록된 계정이 없습니다.</td></tr>`;
    return;
  }

  const sorted = allSubAccountsCache.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  sorted.forEach((sa) => {
    let statusBadge = "";
    if (sa.status === "대기") statusBadge = `<span class="bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-1 rounded">대기중</span>`;
    else if (sa.status === "승인됨") statusBadge = `<span class="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-1 rounded">✅ 승인됨</span>`;
    else if (sa.status === "거절됨") statusBadge = `<span class="bg-rose-100 text-rose-700 text-[11px] font-bold px-2 py-1 rounded">거절됨</span>`;

    const rejectNote =
      sa.status === "거절됨" && sa.rejectReason
        ? `<div class="text-[11px] text-rose-500 mt-1">사유: ${sa.rejectReason}</div>`
        : "";

    const actionBtns =
      sa.status === "대기"
        ? `<button data-sub-id="${sa.id}" data-decision="승인됨" class="account-decision-btn bg-emerald-600 text-white px-2 py-1 rounded text-[10px] font-bold">승인</button>
           <button data-sub-id="${sa.id}" data-decision="거절됨" class="account-decision-btn bg-rose-500 text-white px-2 py-1 rounded text-[10px] font-bold">거절</button>`
        : `<span class="text-slate-400 text-[11px]">처리완료</span>`;

    tbody.insertAdjacentHTML(
      "beforeend",
      `<tr>
        <td class="p-2.5 font-semibold text-slate-800">${sa.userName || sa.userId}</td>
        <td class="p-2.5 text-slate-600">${sa.name}</td>
        <td class="p-2.5"><a href="${sa.link}" target="_blank" rel="noopener" class="text-indigo-600 underline break-all">${sa.link}</a></td>
        <td class="p-2.5 whitespace-nowrap">${statusBadge}${rejectNote}</td>
        <td class="p-2.5 text-right whitespace-nowrap space-x-1">${actionBtns}</td>
      </tr>`
    );
  });

  tbody.querySelectorAll(".account-decision-btn").forEach((btn) => {
    btn.addEventListener("click", () => decideSubAccount(btn.dataset.subId, btn.dataset.decision));
  });
}

export async function decideSubAccount(subId, decision) {
  if (currentRole !== "admin") return;

  let rejectReason = "";
  if (decision === "거절됨") {
    rejectReason = (prompt("거절 사유를 입력해 주세요.") || "").trim();
    if (!rejectReason) {
      alert("거절 사유를 입력해야 거절 처리할 수 있습니다.");
      return;
    }
  }

  await updateDoc(doc(db, "subAccounts", subId), {
    status: decision,
    rejectReason,
    reviewedAt: Date.now(),
  });

  alert(decision === "승인됨" ? "계정이 승인되었습니다." : "계정이 거절 처리되었습니다.");
  await fetchAllSubAccounts();
  renderAccountApprovalTab();
}

function renderMemberManageTab() {
  const tbody = document.getElementById("adminUsersTable");
  tbody.innerHTML = "";

  if (!allUsersCache.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-400">등록된 회원이 없습니다.</td></tr>`;
    return;
  }

  allUsersCache.forEach((u) => {
    const appCount = allAppsCache.filter((a) => a.userId === u.id).length;
    const subCount = allSubAccountsCache.filter((a) => a.userId === u.id).length;
    const isAdminUser = u.role === "admin";
    const isWithdrawn = !!u.withdrawn;

    let typeBadge = isAdminUser
      ? `<span class="bg-indigo-100 text-indigo-700 text-[11px] font-bold px-2 py-1 rounded">관리자</span>`
      : `<span class="bg-slate-100 text-slate-600 text-[11px] font-bold px-2 py-1 rounded">일반회원</span>`;
    if (isWithdrawn) {
      typeBadge += ` <span class="bg-rose-100 text-rose-700 text-[11px] font-bold px-2 py-1 rounded">탈퇴됨</span>`;
    }

    const withdrawBtn = isAdminUser
      ? ""
      : `<button data-uid="${u.id}" class="withdraw-user-btn ${
          isWithdrawn ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-500 hover:bg-rose-600"
        } text-white px-2 py-1 rounded text-[11px] font-bold whitespace-nowrap">${
          isWithdrawn ? "복구" : "탈퇴 처리"
        }</button>`;

    tbody.insertAdjacentHTML(
      "beforeend",
      `<tr>
        <td class="p-2.5 font-semibold text-slate-800">${u.name || "-"} ${u.nickname ? `<span class="text-slate-400 font-normal">(${u.nickname})</span>` : ""}</td>
        <td class="p-2.5 text-slate-600">${u.email || "-"}</td>
        <td class="p-2.5 text-slate-600">${u.phone || "-"}</td>
        <td class="p-2.5 text-slate-600">${subCount}개</td>
        <td class="p-2.5 text-slate-600">${appCount}건</td>
        <td class="p-2.5 whitespace-nowrap">${typeBadge}</td>
        <td class="p-2.5 text-right space-x-1 whitespace-nowrap">
          <button data-uid="${u.id}" class="view-user-btn bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded text-[11px] font-bold whitespace-nowrap">마이페이지 보기</button>
          ${withdrawBtn}
        </td>
      </tr>`
    );
  });

  tbody.querySelectorAll(".view-user-btn").forEach((btn) => {
    btn.addEventListener("click", () => openAdminUserDetail(btn.dataset.uid));
  });
  tbody.querySelectorAll(".withdraw-user-btn").forEach((btn) => {
    btn.addEventListener("click", () => toggleUserWithdrawn(btn.dataset.uid));
  });
}

export function openAdminUserDetail(uid) {
  if (currentRole !== "admin") return;
  const u = allUsersCache.find((x) => x.id === uid);
  if (!u) return;

  document.getElementById("adminUserDetailInfo").innerText =
    `${u.name || "-"}${u.nickname ? ` (${u.nickname})` : ""} | ${u.email || "-"} | ${u.phone || "-"}`;

  const subContainer = document.getElementById("adminUserSubAccountList");
  subContainer.innerHTML = "";
  const subAccounts = allSubAccountsCache.filter((a) => a.userId === uid);
  if (!subAccounts.length) {
    subContainer.innerHTML = `<span class="text-xs text-slate-400">등록된 계정이 없습니다.</span>`;
  } else {
    subAccounts.forEach((acc) => {
      let statusTag = "";
      if (acc.status === "대기") statusTag = `<span class="text-amber-600">(승인 대기)</span>`;
      else if (acc.status === "승인됨") statusTag = `<span class="text-emerald-600">(승인됨)</span>`;
      else if (acc.status === "거절됨") statusTag = `<span class="text-rose-600">(거절됨)</span>`;

      subContainer.insertAdjacentHTML(
        "beforeend",
        `<span class="bg-white border border-slate-200 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-lg shadow-sm">👤 ${acc.name} ${statusTag}</span>`
      );
    });
  }

  const userApps = allAppsCache
    .filter((a) => a.userId === uid)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const tbody = document.getElementById("adminUserAppsTable");
  tbody.innerHTML = "";

  if (!userApps.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">신청 내역이 없습니다.</td></tr>`;
  } else {
    userApps.forEach((app) => {
      const job = jobsCache.find((j) => j.id === app.jobId);

      tbody.insertAdjacentHTML(
        "beforeend",
        `<tr>
          <td class="p-3 font-semibold text-slate-800">${job ? job.title : "일감"}</td>
          <td class="p-3 font-medium text-slate-600">${app.subAccount}</td>
          <td class="p-3 font-bold text-indigo-600">${job ? Number(job.reward).toLocaleString() : 0} P</td>
          <td class="p-3">${statusBadgeHTML(app.status)}</td>
          <td class="p-3">${app.url ? `<a href="${app.url}" target="_blank" rel="noopener" class="text-indigo-600 underline">링크확인</a>` : "-"}</td>
        </tr>`
      );
    });
  }

  closeModal("adminAccountModal");
  openModal("adminUserDetailModal");
}

export async function toggleUserWithdrawn(uid) {
  if (currentRole !== "admin") return;
  const u = allUsersCache.find((x) => x.id === uid);
  if (!u) return;

  if (u.role === "admin") {
    alert("관리자 계정은 탈퇴 처리할 수 없습니다.");
    return;
  }

  const nextWithdrawn = !u.withdrawn;
  const confirmMsg = nextWithdrawn
    ? `"${u.name || u.email}" 회원을 탈퇴 처리하시겠습니까? 처리 즉시 로그인이 차단됩니다.`
    : `"${u.name || u.email}" 회원의 탈퇴 처리를 해제하시겠습니까?`;
  if (!confirm(confirmMsg)) return;

  await updateDoc(doc(db, "users", uid), {
    withdrawn: nextWithdrawn,
    withdrawnAt: nextWithdrawn ? Date.now() : null,
  });

  alert(nextWithdrawn ? "탈퇴 처리되었습니다." : "탈퇴 처리가 해제되었습니다.");
  await fetchAllUsers();
  renderMemberManageTab();
}

// ---------- 관리자: ⚙️ 정산관리 (검수 + 정산) ----------
export async function openAdminSettlementModal() {
  if (currentRole !== "admin") {
    alert("관리자 전용 기능입니다.");
    return;
  }

  await fetchAllApplications();
  renderReviewTab();
  renderSettlementTab();
  openModal("adminSettlementModal");
}

function renderReviewTab() {
  const tbody = document.getElementById("reviewTable");
  tbody.innerHTML = "";

  const items = allAppsCache
    .filter((a) => a.status === "제출완료")
    .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">검수할 제출 내역이 없습니다.</td></tr>`;
    return;
  }

  items.forEach((app) => {
    const job = jobsCache.find((j) => j.id === app.jobId);
    tbody.insertAdjacentHTML(
      "beforeend",
      `<tr>
        <td class="p-2.5 font-bold text-slate-700">${app.userName || app.userId}<br><span class="text-[10px] text-indigo-600">(${app.subAccount})</span></td>
        <td class="p-2.5 text-slate-700">${job ? job.title : "일감"}</td>
        <td class="p-2.5">${app.url ? `<a href="${app.url}" target="_blank" rel="noopener" class="text-indigo-600 underline">링크확인</a>` : ""}</td>
        <td class="p-2.5 text-right space-x-1 whitespace-nowrap">
          <button data-app-id="${app.id}" class="review-approve-btn bg-emerald-600 text-white px-2 py-1 rounded text-[10px] font-bold">승인</button>
          <button data-app-id="${app.id}" class="review-reject-btn bg-rose-500 text-white px-2 py-1 rounded text-[10px] font-bold">거절</button>
        </td>
      </tr>`
    );
  });

  tbody.querySelectorAll(".review-approve-btn").forEach((btn) => {
    btn.addEventListener("click", () => reviewSubmission(btn.dataset.appId, true));
  });
  tbody.querySelectorAll(".review-reject-btn").forEach((btn) => {
    btn.addEventListener("click", () => reviewSubmission(btn.dataset.appId, false));
  });
}

export async function reviewSubmission(appId, approved) {
  if (currentRole !== "admin") return;

  let rejectReason = "";
  if (!approved) {
    rejectReason = (prompt("거절 사유를 입력해 주세요.") || "").trim();
    if (!rejectReason) {
      alert("거절 사유를 입력해야 거절 처리할 수 있습니다.");
      return;
    }
  }

  await updateDoc(doc(db, "applications", appId), {
    status: approved ? "정산예정" : "반려됨",
    rejectReason,
    reviewedAt: Date.now(),
  });

  alert(approved ? "제출이 승인되어 정산예정 상태로 변경되었습니다." : "제출이 거절 처리되었습니다.");
  await fetchAllApplications();
  renderReviewTab();
  renderSettlementTab();
}

function renderSettlementTab() {
  const tbody = document.getElementById("settlementTable");
  tbody.innerHTML = "";

  const items = allAppsCache
    .filter((a) => a.status === "정산예정" || a.status === "정산완료")
    .sort((a, b) => (b.reviewedAt || 0) - (a.reviewedAt || 0));

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">정산 대상 내역이 없습니다.</td></tr>`;
    return;
  }

  items.forEach((app) => {
    const job = jobsCache.find((j) => j.id === app.jobId);
    const isPending = app.status === "정산예정";
    const actionBtn = isPending
      ? `<button data-app-id="${app.id}" class="settle-btn bg-indigo-600 text-white px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap">정산완료 처리</button>`
      : `<span class="text-slate-400 text-[11px]">처리완료</span>`;

    tbody.insertAdjacentHTML(
      "beforeend",
      `<tr>
        <td class="p-2.5 font-bold text-slate-700">${app.userName || app.userId}<br><span class="text-[10px] text-indigo-600">(${app.subAccount})</span></td>
        <td class="p-2.5 text-slate-700">${job ? job.title : "일감"}</td>
        <td class="p-2.5 font-bold text-indigo-600">${job ? Number(job.reward).toLocaleString() : 0} P</td>
        <td class="p-2.5">${statusBadgeHTML(app.status)}</td>
        <td class="p-2.5 text-right">${actionBtn}</td>
      </tr>`
    );
  });

  tbody.querySelectorAll(".settle-btn").forEach((btn) => {
    btn.addEventListener("click", () => markSettled(btn.dataset.appId));
  });
}

export async function markSettled(appId) {
  if (currentRole !== "admin") return;
  if (!confirm("정산(지급)을 완료 처리하시겠습니까?")) return;

  await updateDoc(doc(db, "applications", appId), { status: "정산완료", settledAt: Date.now() });
  alert("정산완료 처리되었습니다.");
  await fetchAllApplications();
  renderSettlementTab();
}

// ---------- 관리자: 일감 등록/수정/삭제 ----------
export function openAddJobModal() {
  if (currentRole !== "admin") return;
  document.getElementById("addJobForm").reset();
  document.getElementById("editJobId").value = "";
  document.getElementById("addJobModalTitle").textContent = "⚙️ [관리자] 신규 일감 등록";
  document.getElementById("addJobSubmitBtn").textContent = "등록 완료";
  openModal("addJobModal");
}

export function openEditJobModal(jobId) {
  if (currentRole !== "admin") return;
  const job = jobsCache.find((j) => j.id === jobId);
  if (!job) return;

  document.getElementById("editJobId").value = jobId;
  document.getElementById("jobCategory").value = job.category;
  document.getElementById("jobTitle").value = job.title;
  document.getElementById("jobDesc").value = job.desc;
  document.getElementById("jobReward").value = job.reward;
  document.getElementById("addJobModalTitle").textContent = "⚙️ [관리자] 일감 수정";
  document.getElementById("addJobSubmitBtn").textContent = "수정 완료";
  openModal("addJobModal");
}

export async function addNewJob(e) {
  e.preventDefault();
  if (currentRole !== "admin") {
    alert("관리자만 일감을 등록할 수 있습니다.");
    return;
  }

  const editId = document.getElementById("editJobId").value;
  const jobData = {
    category: document.getElementById("jobCategory").value,
    title: document.getElementById("jobTitle").value,
    desc: document.getElementById("jobDesc").value,
    reward: Number(document.getElementById("jobReward").value),
  };

  if (editId) {
    await updateDoc(doc(db, "jobs", editId), jobData);
    alert("일감이 수정되었습니다.");
  } else {
    await addDoc(collection(db, "jobs"), { ...jobData, createdAt: Date.now() });
    alert("새로운 일감이 등록되었습니다.");
  }

  closeModal("addJobModal");
  e.target.reset();
}

export async function deleteJob(jobId) {
  if (currentRole !== "admin") return;
  const job = jobsCache.find((j) => j.id === jobId);
  if (!confirm(`"${job ? job.title : "이 일감"}"을(를) 삭제하시겠습니까? 삭제 후 되돌릴 수 없습니다.`)) return;
  await deleteDoc(doc(db, "jobs", jobId));
}

// ---------- 로그인/회원가입 폼 핸들러 ----------
export async function onSignupSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("signupName").value;
  const nickname = document.getElementById("signupNickname").value;
  const phone = document.getElementById("signupPhone").value;
  const email = document.getElementById("signupEmail").value;
  const pw = document.getElementById("signupPw").value;

  try {
    await handleSignup(name, nickname, phone, email, pw);
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
