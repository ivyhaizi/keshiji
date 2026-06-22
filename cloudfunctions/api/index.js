const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const COLLECTIONS = {
  organizations: "organizations",
  users: "users",
  memberships: "memberships",
  courses: "courses",
  students: "students",
  lessonRecords: "lesson_records"
};

const DEFAULT_ORG_NAME = "课时小伙伴演示机构";

function ok(data = {}) {
  return { ok: true, data };
}

function fail(message, code = "BAD_REQUEST") {
  return { ok: false, code, message };
}

function now() {
  return db.serverDate();
}

function formatDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function publicId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function ensureCollections() {
  await Promise.all(
    Object.values(COLLECTIONS).map(async (name) => {
      try {
        await db.createCollection(name);
      } catch (error) {
        const message = error.message || "";
        if (!message.includes("already exists") && !message.includes("collection exists")) {
          // Some environments do not allow runtime collection creation. Existing
          // collections still work; truly missing collections will fail later with
          // a clearer database error.
        }
      }
    })
  );
}

async function first(collection, where) {
  const result = await db.collection(collection).where(where).limit(1).get();
  return result.data[0] || null;
}

async function ensureUser(openid) {
  const existing = await first(COLLECTIONS.users, { openid });
  if (existing) return existing;

  const user = {
    openid,
    nickname: "微信用户",
    createdAt: now(),
    updatedAt: now()
  };
  const result = await db.collection(COLLECTIONS.users).add({ data: user });
  return { _id: result._id, ...user };
}

async function seedCourses(orgId) {
  const count = await db.collection(COLLECTIONS.courses).where({ orgId }).count();
  if (count.total > 0) return;

  const courses = [
    { publicId: "course_piano", orgId, name: "钢琴一对一", unit: 1, status: "enabled" },
    { publicId: "course_art", orgId, name: "少儿美术", unit: 1, status: "enabled" },
    { publicId: "course_dance", orgId, name: "舞蹈小班", unit: 1.5, status: "enabled" }
  ];

  await Promise.all(
    courses.map((course) =>
      db.collection(COLLECTIONS.courses).add({
        data: {
          ...course,
          createdAt: now(),
          updatedAt: now()
        }
      })
    )
  );
}

async function seedStudents(orgId) {
  const count = await db.collection(COLLECTIONS.students).where({ orgId }).count();
  if (count.total > 0) return;

  const piano = await first(COLLECTIONS.courses, { orgId, publicId: "course_piano" });
  const art = await first(COLLECTIONS.courses, { orgId, publicId: "course_art" });

  const students = [
    {
      publicId: "stu_chenxi",
      orgId,
      name: "陈曦",
      guardian: "陈妈妈",
      phone: "13800000001",
      courseId: piano ? piano._id : "",
      remaining: 12,
      status: "正常"
    },
    {
      publicId: "stu_xiaoyu",
      orgId,
      name: "林小雨",
      guardian: "林爸爸",
      phone: "13800000002",
      courseId: art ? art._id : "",
      remaining: 8,
      status: "正常"
    }
  ];

  const createdStudents = [];
  for (const student of students) {
    const result = await db.collection(COLLECTIONS.students).add({
      data: {
        ...student,
        createdAt: now(),
        updatedAt: now()
      }
    });
    createdStudents.push({ _id: result._id, ...student });
  }

  const chenxi = createdStudents.find((student) => student.publicId === "stu_chenxi");

  await db.collection(COLLECTIONS.lessonRecords).add({
    data: {
      publicId: "rec_seed_1",
      orgId,
      studentId: chenxi ? chenxi._id : "",
      studentName: "陈曦",
      courseId: piano ? piano._id : "",
      courseName: "钢琴一对一",
      hours: 1,
      deltaHours: -1,
      balanceAfter: 12,
      type: "checkin",
      note: "常规上课",
      createdAtText: "2026-06-20 18:30",
      createdAt: now()
    }
  });
}

async function ensureOrgAndMembership(user) {
  const membership = await first(COLLECTIONS.memberships, {
    userId: user._id,
    status: "active"
  });

  if (membership) {
    await seedCourses(membership.orgId);
    return membership;
  }

  const orgResult = await db.collection(COLLECTIONS.organizations).add({
    data: {
      name: DEFAULT_ORG_NAME,
      ownerUserId: user._id,
      plan: "free_trial",
      createdAt: now(),
      updatedAt: now()
    }
  });

  const membershipData = {
    orgId: orgResult._id,
    userId: user._id,
    role: "admin",
    status: "active",
    createdAt: now(),
    updatedAt: now()
  };
  const membershipResult = await db.collection(COLLECTIONS.memberships).add({
    data: membershipData
  });

  const createdMembership = { _id: membershipResult._id, ...membershipData };
  await seedCourses(orgResult._id);
  await seedStudents(orgResult._id);
  return createdMembership;
}

async function getContext() {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error("无法获取微信用户 openid");
  }

  const user = await ensureUser(openid);
  const membership = await ensureOrgAndMembership(user);
  const org = await first(COLLECTIONS.organizations, { _id: membership.orgId });

  return {
    openid,
    user,
    membership,
    org,
    orgId: membership.orgId,
    role: membership.role
  };
}

function assertCanManage(role) {
  if (!["admin", "staff"].includes(role)) {
    throw new Error("当前角色没有管理权限");
  }
}

function assertCanCheckin(role) {
  if (!["admin", "staff", "teacher"].includes(role)) {
    throw new Error("当前角色没有打卡权限");
  }
}

async function listCourses(orgId) {
  const result = await db
    .collection(COLLECTIONS.courses)
    .where({ orgId, status: "enabled" })
    .orderBy("createdAt", "asc")
    .get();
  return result.data.map((course) => ({
    id: course._id,
    name: course.name,
    unit: course.unit
  }));
}

async function listStudents(orgId) {
  const result = await db
    .collection(COLLECTIONS.students)
    .where({ orgId, status: _.neq("deleted") })
    .orderBy("createdAt", "desc")
    .get();
  return result.data.map((student) => ({
    id: student._id,
    name: student.name,
    guardian: student.guardian || "",
    phone: student.phone || "",
    courseId: student.courseId,
    remaining: Number(student.remaining || 0),
    status: student.status || "正常"
  }));
}

async function listRecords(orgId) {
  const result = await db
    .collection(COLLECTIONS.lessonRecords)
    .where({ orgId })
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();
  return result.data.map((record) => ({
    id: record._id,
    studentId: record.studentId,
    studentName: record.studentName,
    courseName: record.courseName,
    hours: Math.abs(Number(record.hours || record.deltaHours || 0)),
    type: record.type,
    note: record.note || "",
    createdAt: record.createdAtText || ""
  }));
}

async function login() {
  const context = await getContext();
  return ok({
    user: {
      id: context.user._id,
      nickname: context.user.nickname
    },
    org: {
      id: context.org._id,
      name: context.org.name,
      plan: context.org.plan
    },
    role: context.role
  });
}

async function dashboard() {
  const context = await getContext();
  const [students, records] = await Promise.all([listStudents(context.orgId), listRecords(context.orgId)]);
  const monthPrefix = formatDate().slice(0, 7);
  const totalRemaining = students.reduce((sum, item) => sum + Number(item.remaining || 0), 0);
  const monthConsumed = records
    .filter((record) => record.type === "checkin" && record.createdAt.startsWith(monthPrefix))
    .reduce((sum, record) => sum + Number(record.hours || 0), 0);
  const lowBalance = students.filter((item) => Number(item.remaining || 0) <= 3).length;

  return ok({
    stats: {
      studentCount: students.length,
      totalRemaining: Number(totalRemaining.toFixed(2)),
      monthConsumed: Number(monthConsumed.toFixed(2)),
      lowBalance
    },
    recentRecords: records.slice(0, 5)
  });
}

async function studentList() {
  const context = await getContext();
  const [students, courses] = await Promise.all([listStudents(context.orgId), listCourses(context.orgId)]);
  return ok({ students, courses });
}

async function studentCreate(payload) {
  const context = await getContext();
  assertCanManage(context.role);

  const name = String(payload.name || "").trim();
  if (!name) return fail("请填写学员姓名");

  const course = await first(COLLECTIONS.courses, {
    _id: payload.courseId,
    orgId: context.orgId
  });
  if (!course) return fail("课程不存在");

  const result = await db.collection(COLLECTIONS.students).add({
    data: {
      publicId: publicId("stu"),
      orgId: context.orgId,
      name,
      guardian: payload.guardian || "",
      phone: payload.phone || "",
      courseId: course._id,
      remaining: Number(payload.remaining || 0),
      status: "正常",
      createdAt: now(),
      updatedAt: now()
    }
  });

  return ok({ id: result._id });
}

async function studentRecharge(payload) {
  const context = await getContext();
  assertCanManage(context.role);

  const hours = Number(payload.hours || 0);
  if (hours <= 0) return fail("充值课时必须大于 0");

  const student = await first(COLLECTIONS.students, {
    _id: payload.studentId,
    orgId: context.orgId
  });
  if (!student) return fail("学员不存在");

  const balanceAfter = Number((Number(student.remaining || 0) + hours).toFixed(2));
  await db.collection(COLLECTIONS.students).doc(student._id).update({
    data: {
      remaining: balanceAfter,
      updatedAt: now()
    }
  });

  await db.collection(COLLECTIONS.lessonRecords).add({
    data: {
      publicId: publicId("rec"),
      orgId: context.orgId,
      studentId: student._id,
      studentName: student.name,
      courseId: "",
      courseName: "课时充值",
      hours,
      deltaHours: hours,
      balanceAfter,
      type: "recharge",
      note: "手动充值",
      operatorId: context.user._id,
      createdAtText: formatDate(),
      createdAt: now()
    }
  });

  return ok({ balanceAfter });
}

async function lessonCheckin(payload) {
  const context = await getContext();
  assertCanCheckin(context.role);

  const hours = Number(payload.hours || 0);
  if (hours <= 0) return fail("扣减课时必须大于 0");

  const student = await first(COLLECTIONS.students, {
    _id: payload.studentId,
    orgId: context.orgId
  });
  if (!student) return fail("学员不存在");

  const course = await first(COLLECTIONS.courses, {
    _id: payload.courseId,
    orgId: context.orgId
  });
  if (!course) return fail("课程不存在");

  const currentRemaining = Number(student.remaining || 0);
  if (currentRemaining < hours) return fail("剩余课时不足");

  const balanceAfter = Number((currentRemaining - hours).toFixed(2));
  await db.collection(COLLECTIONS.students).doc(student._id).update({
    data: {
      remaining: balanceAfter,
      updatedAt: now()
    }
  });

  const recordResult = await db.collection(COLLECTIONS.lessonRecords).add({
    data: {
      publicId: publicId("rec"),
      orgId: context.orgId,
      studentId: student._id,
      studentName: student.name,
      courseId: course._id,
      courseName: course.name,
      hours,
      deltaHours: -hours,
      balanceAfter,
      type: "checkin",
      note: payload.note || "上课打卡",
      operatorId: context.user._id,
      createdAtText: formatDate(),
      createdAt: now()
    }
  });

  return ok({ id: recordResult._id, balanceAfter });
}

async function recordList() {
  const context = await getContext();
  const records = await listRecords(context.orgId);
  return ok({ records });
}

async function profileGet() {
  const context = await getContext();
  const [students, records] = await Promise.all([listStudents(context.orgId), listRecords(context.orgId)]);
  return ok({
    org: {
      id: context.org._id,
      name: context.org.name,
      plan: context.org.plan
    },
    role: context.role,
    totals: {
      studentCount: students.length,
      recordCount: records.length
    }
  });
}

async function resetDemoData() {
  const context = await getContext();
  assertCanManage(context.role);

  const [students, records, courses] = await Promise.all([
    db.collection(COLLECTIONS.students).where({ orgId: context.orgId }).get(),
    db.collection(COLLECTIONS.lessonRecords).where({ orgId: context.orgId }).get(),
    db.collection(COLLECTIONS.courses).where({ orgId: context.orgId }).get()
  ]);

  await Promise.all([
    ...students.data.map((item) => db.collection(COLLECTIONS.students).doc(item._id).remove()),
    ...records.data.map((item) => db.collection(COLLECTIONS.lessonRecords).doc(item._id).remove()),
    ...courses.data.map((item) => db.collection(COLLECTIONS.courses).doc(item._id).remove())
  ]);

  await seedCourses(context.orgId);
  await seedStudents(context.orgId);

  return ok({});
}

exports.main = async (event) => {
  try {
    await ensureCollections();
    const action = event.action;
    const payload = event.payload || {};

    const handlers = {
      dashboard,
      lessonCheckin,
      login,
      profileGet,
      recordList,
      resetDemoData,
      studentCreate,
      studentList,
      studentRecharge
    };

    if (!handlers[action]) {
      return fail("未知接口");
    }

    return await handlers[action](payload);
  } catch (error) {
    return fail(error.message || "服务器错误", "SERVER_ERROR");
  }
};
