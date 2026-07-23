/* =========================================================
   HostelCare — Core Application Script
   Handles: data store (localStorage), auth, seeding,
   shared UI behaviors (nav, ripple, toast, modal).
   ========================================================= */

const HC = (() => {
  const STORAGE_KEYS = {
    complaints: "hc_complaints",
    session: "hc_session",
    students: "hc_students",
  };

  const CATEGORIES = [
    "Electrical", "Plumbing", "Carpentry", "Furniture",
    "Internet / Wi-Fi", "Cleaning", "Pest Control", "Other",
  ];

  const HOSTEL_CONFIG_KEY = "hc_hostel_blocks";
  const DEFAULT_HOSTEL_BLOCKS = {
    "Aditya Boys Hostel": ["A", "B", "C", "D", "E", "F"],
    "Aditya Girls Hostel": ["A", "B", "C", "D", "E", "F", "G"],
  };
  const savedHostelBlocks = JSON.parse(localStorage.getItem(HOSTEL_CONFIG_KEY) || "null");
  const HOSTEL_BLOCKS = savedHostelBlocks || structuredClone(DEFAULT_HOSTEL_BLOCKS);
  const HOSTELS = Object.keys(HOSTEL_BLOCKS);

  const isSupabaseConfigured = () =>
    typeof window.supabase !== "undefined" &&
    window.SUPABASE_URL && !window.SUPABASE_URL.startsWith("YOUR_") &&
    window.SUPABASE_ANON_KEY && !window.SUPABASE_ANON_KEY.startsWith("YOUR_");
  const supabaseClient = isSupabaseConfigured()
    ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : null;

  function getBlocksForHostel(hostel) {
    return HOSTEL_BLOCKS[hostel] || [];
  }

  function saveHostelConfiguration() {
    localStorage.setItem(HOSTEL_CONFIG_KEY, JSON.stringify(HOSTEL_BLOCKS));
    HOSTELS.splice(0, HOSTELS.length, ...Object.keys(HOSTEL_BLOCKS));
  }
  function addHostel(name) {
    const hostelName = name.trim();
    if (!hostelName) return { ok: false, message: "Enter a hostel name." };
    if (HOSTEL_BLOCKS[hostelName]) return { ok: false, message: "This hostel already exists." };
    HOSTEL_BLOCKS[hostelName] = [];
    saveHostelConfiguration();
    return { ok: true };
  }
  function addBlock(hostel, block) {
    const blockName = block.trim().toUpperCase();
    if (!HOSTEL_BLOCKS[hostel]) return { ok: false, message: "Select a valid hostel." };
    if (!blockName) return { ok: false, message: "Enter a block name." };
    if (HOSTEL_BLOCKS[hostel].includes(blockName)) return { ok: false, message: "This block already exists." };
    HOSTEL_BLOCKS[hostel].push(blockName);
    saveHostelConfiguration();
    return { ok: true };
  }

  /* ---------------- Initial Data ---------------- */
  function seedIfNeeded() {
    // Records are created only by real users through Supabase.
  }

  function removeLegacyMockData() {
    const mockStudentIds = new Set(["STU2024001", "STU2024002"]);
    const mockComplaintIds = new Set(["HC-1001", "HC-1002", "HC-1003", "HC-1004", "HC-1005", "HC-1006", "HC-1007"]);
    const students = getStudents().filter((student) => !mockStudentIds.has(student.studentId));
    const complaints = getComplaints().filter((complaint) => !mockComplaintIds.has(complaint.id));
    localStorage.setItem(STORAGE_KEYS.students, JSON.stringify(students));
    localStorage.setItem(STORAGE_KEYS.complaints, JSON.stringify(complaints));
  }

  function mkComplaint({ id, studentId, studentName, hostel, block, floor, room, category, description, status, createdAt, image }) {
    const timeline = [{ status: "Pending", date: createdAt, remark: "Complaint submitted by student." }];
    if (status === "Under Repair" || status === "Completed") {
      timeline.push({ status: "Under Repair", date: createdAt + 43200000, remark: "Warden reviewed and assigned to maintenance staff." });
    }
    if (status === "Completed") {
      timeline.push({ status: "Completed", date: createdAt + 129600000, remark: "Repair completed and verified by warden." });
    }
    return { id, studentId, studentName, hostel, block, floor, room, category, description, status, createdAt, image: image || null, timeline };
  }

  /* ---------------- Data Access ---------------- */
  function getComplaints() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.complaints) || "[]");
  }
  function saveComplaints(list) {
    localStorage.setItem(STORAGE_KEYS.complaints, JSON.stringify(list));
  }
  function getStudents() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.students) || "[]");
  }
  function getStudentById(id) {
    return getStudents().find((s) => s.studentId === id);
  }
  function nextComplaintId() {
    const list = getComplaints();
    const maxNum = list.reduce((max, c) => {
      const n = parseInt(String(c.id).replace("HC-", ""), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 1000);
    return "HC-" + (maxNum + 1);
  }
  function addComplaint(data) {
    const list = getComplaints();
    const complaint = mkComplaint({ ...data, id: nextComplaintId(), status: "Pending", createdAt: Date.now() });
    list.unshift(complaint);
    saveComplaints(list);
    return complaint;
  }
  function updateComplaintStatus(id, newStatus, remark) {
    const list = getComplaints();
    const c = list.find((x) => x.id === id);
    if (!c) return null;
    c.status = newStatus;
    c.timeline.push({ status: newStatus, date: Date.now(), remark: remark || defaultRemark(newStatus) });
    saveComplaints(list);
    return c;
  }
  function defaultRemark(status) {
    if (status === "Under Repair") return "Warden assigned this complaint to maintenance staff.";
    if (status === "Completed") return "Repair completed and verified by warden.";
    return "Status updated.";
  }

  /* ---------------- Auth / Session ---------------- */
  function getSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.session) || "null"); }
    catch (e) { return null; }
  }
  function setSession(session) {
    localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
  }
  function clearSession() {
    localStorage.removeItem(STORAGE_KEYS.session);
  }
  async function loginStudent(studentId, password) {
    if (supabaseClient) {
      let email = studentId.trim();
      if (!email.includes("@")) {
        const { data: loginEmail, error: lookupError } = await supabaseClient
          .rpc("get_email_for_roll", { roll_number_input: email });
        if (lookupError || !loginEmail) return { ok: false, message: "Roll number not found." };
        email = loginEmail;
      }
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email, password,
      });
      if (error) return { ok: false, message: error.message };
      const { data: profile, error: profileError } = await supabaseClient
        .from("profiles").select("*").eq("id", data.user.id).single();
      if (profileError) return { ok: false, message: "Could not load your student profile." };
      const student = {
        studentId: profile.roll_number, name: profile.name, email: profile.email,
        hostel: profile.hostel || "", block: profile.block || "", floor: profile.floor || "", room: profile.room || "",
      };
      localStorage.setItem(STORAGE_KEYS.students, JSON.stringify([student]));
      localStorage.setItem("hc_supabase_enabled", "true");
      setSession({ role: "student", studentId: student.studentId, authUserId: data.user.id });
      return { ok: true };
    }
    const student = getStudentById(studentId.trim());
    if (!student) return { ok: false, message: "No student account found." };
    if (student.password !== password) return { ok: false, message: "Incorrect password." };
    setSession({ role: "student", studentId: student.studentId });
    return { ok: true };
  }
  async function createStudentAccount({ rollNumber, name, email, password }) {
    if (!supabaseClient) return { ok: false, message: "Add your Supabase URL and anon key in js/supabase-config.js first." };
    const { data, error } = await supabaseClient.auth.signUp({
      email: email.trim(), password,
      options: { data: { roll_number: rollNumber.trim(), name: name.trim() } },
    });
    if (error) return { ok: false, message: error.message };
    localStorage.setItem("hc_supabase_enabled", "true");
    if (data.session) {
      const student = { studentId: rollNumber.trim(), name: name.trim(), email: email.trim(), hostel: "", block: "", floor: "", room: "" };
      localStorage.setItem(STORAGE_KEYS.students, JSON.stringify([student]));
      setSession({ role: "student", studentId: student.studentId, authUserId: data.user.id });
      return { ok: true, signedIn: true, message: "Account created successfully." };
    }
    return { ok: true, signedIn: false, message: "Account created. Check your email to confirm it, then log in." };
  }
  function loginWarden(username, password) {
    if (username.trim().toLowerCase() !== "warden") {
      return { ok: false, message: "Unknown admin username. Try 'warden'." };
    }
    if (password !== "admin123") {
      return { ok: false, message: "Incorrect password. Try admin123." };
    }
    setSession({ role: "warden", username: "warden" });
    return { ok: true };
  }
  function logout(redirectTo) {
    clearSession();
    window.location.href = redirectTo || "index.html";
  }
  function requireStudent() {
    const s = getSession();
    if (!s || s.role !== "student") { window.location.href = "index.html"; return null; }
    return s;
  }
  function requireWarden() {
    const s = getSession();
    if (!s || s.role !== "warden") { window.location.href = "admin-login.html"; return null; }
    return s;
  }

  /* ---------------- Formatting helpers ---------------- */
  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }
  function formatDateTime(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + " · " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }
  function badgeClass(status) {
    if (status === "Pending") return "badge-pending";
    if (status === "Under Repair") return "badge-progress";
    return "badge-completed";
  }
  function initials(name) {
    return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  /* ---------------- UI: Ripple ---------------- */
  function attachRipple() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn");
      if (!btn) return;
      const circle = document.createElement("span");
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      circle.className = "ripple";
      circle.style.width = circle.style.height = size + "px";
      circle.style.left = (e.clientX - rect.left - size / 2) + "px";
      circle.style.top = (e.clientY - rect.top - size / 2) + "px";
      btn.appendChild(circle);
      setTimeout(() => circle.remove(), 600);
    });
  }

  /* ---------------- UI: Toast ---------------- */
  let toastTimer = null;
  function toast(message) {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  /* ---------------- UI: Mobile admin drawer ---------------- */
  function initAdminDrawer() {
    const btn = document.querySelector(".mobile-menu-btn");
    const drawer = document.querySelector(".admin-drawer");
    const overlay = document.querySelector(".admin-drawer-overlay");
    if (!btn || !drawer || !overlay) return;
    const open = () => { drawer.classList.add("open"); overlay.classList.add("open"); };
    const close = () => { drawer.classList.remove("open"); overlay.classList.remove("open"); };
    btn.addEventListener("click", open);
    overlay.addEventListener("click", close);
  }

  return {
    STORAGE_KEYS, CATEGORIES, HOSTELS, HOSTEL_BLOCKS, getBlocksForHostel, addHostel, addBlock,
    seedIfNeeded, removeLegacyMockData, getComplaints, saveComplaints, getStudents, getStudentById,
    addComplaint, updateComplaintStatus, nextComplaintId,
    getSession, setSession, clearSession, loginStudent, createStudentAccount, loginWarden, logout,
    requireStudent, requireWarden,
    formatDate, formatDateTime, badgeClass, initials, escapeHtml,
    attachRipple, toast, initAdminDrawer,
  };
})();

function initPageLoader() {
  const loader = document.createElement("div");
  loader.className = "page-loader";
  loader.innerHTML = '<div class="page-loader-spinner" aria-label="Loading"></div><div class="page-loader-text">Loading...</div>';
  document.body.prepend(loader);
  window.addEventListener("load", () => {
    loader.classList.add("is-hidden");
    setTimeout(() => loader.remove(), 300);
  }, { once: true });
}

initPageLoader();

document.addEventListener("DOMContentLoaded", () => {
  HC.removeLegacyMockData();
  HC.seedIfNeeded();
  HC.attachRipple();
  HC.initAdminDrawer();
  document.querySelector(".auth-demo-hint strong")?.closest(".auth-demo-hint")?.remove();
});
