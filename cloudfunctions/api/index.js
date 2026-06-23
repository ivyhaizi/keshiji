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
  lessonRecords: "lesson_records",
  operationLogs: "operation_logs",
  feedbacks: "feedbacks"
};

const DEFAULT_ORG_NAME = "课时小伙伴演示机构";
const ROLES = {
  admin: "admin",
  teacher: "teacher",
  parent: "parent"
};

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

function getCheckinTimeText(payload) {
  const classDate = String(payload.classDate || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(classDate)) {
    return `${classDate} 00:00`;
  }
  return formatDate();
}

function getCheckinTargetDateText(payload) {
  const classDate = String(payload.classDate || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(classDate)) {
    return classDate;
  }
  return formatDate().slice(0, 10);
}

function publicId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function getPermissions(role) {
  return {
    canManageCourses: role === ROLES.admin,
    canManageStudents: role === ROLES.admin,
    canRecharge: role === ROLES.admin,
    canCheckin: [ROLES.admin, ROLES.teacher].includes(role),
    canUndoCheckin: [ROLES.admin, ROLES.teacher].includes(role),
    canUndoRecharge: role === ROLES.admin,
    canViewLogs: role === ROLES.admin,
    canManageMembers: role === ROLES.admin
  };
}

function getRoleName(role) {
  const names = {
    admin: "管理员",
    teacher: "老师",
    parent: "家长"
  };
  return names[role] || role || "未设置";
}

function assertAdmin(context) {
  if (context.role !== ROLES.admin) {
    throw new Error("当前角色没有管理员权限");
  }
}

function assertCanCheckin(context) {
  if (!getPermissions(context.role).canCheckin) {
    throw new Error("当前角色没有打卡权限");
  }
}

function assertCanUndoRecord(context, record) {
  const permissions = getPermissions(context.role);
  if (record.type === "checkin" && permissions.canUndoCheckin) return;
  if (record.type === "recharge" && permissions.canUndoRecharge) return;
  throw new Error("当前角色没有撤销该记录的权限");
}

function getBoundStudentIds(context) {
  if (context.role !== ROLES.parent) return null;
  return Array.isArray(context.membership.studentIds) ? context.membership.studentIds : [];
}

function isStudentVisibleToContext(context, studentId) {
  const boundStudentIds = getBoundStudentIds(context);
  if (boundStudentIds === null) return true;
  return boundStudentIds.includes(studentId);
}

function decorateContext(data, context) {
  return {
    ...data,
    role: context.role,
    roleName: getRoleName(context.role),
    permissions: getPermissions(context.role)
  };
}

function decorateUnbound(data = {}) {
  return {
    ...data,
    unbound: true,
    role: "",
    roleName: "未加入机构",
    permissions: getPermissions("")
  };
}

async function ensureCollections() {
  await Promise.all(
    Object.values(COLLECTIONS).map(async (name) => {
      try {
        await db.createCollection(name);
      } catch (error) {
        const message = error.message || "";
        if (!message.includes("already exists") && !message.includes("collection exists")) {
          // Runtime collection creation can be disabled. Existing collections still work.
        }
      }
    })
  );
}

async function first(collection, where) {
  const result = await db.collection(collection).where(where).limit(1).get();
  return result.data[0] || null;
}

async function findMembershipByUserId(userId) {
  const result = await db
    .collection(COLLECTIONS.memberships)
    .where({
      userId,
      status: "active"
    })
    .limit(20)
    .get();
  const bound = result.data.find((membership) => membership.role !== ROLES.admin || Array.isArray(membership.studentIds));
  return bound || result.data[0] || null;
}

async function addOperationLog(context, action, targetType, targetId, detail = {}) {
  await db.collection(COLLECTIONS.operationLogs).add({
    data: {
      orgId: context.orgId,
      operatorId: context.user._id,
      operatorRole: context.role,
      operatorName: context.membership.displayName || getRoleName(context.role),
      action,
      targetType,
      targetId,
      detail,
      operatedAtText: formatDate(),
      createdAt: now()
    }
  });
}

async function findActiveCourseByName(orgId, name, excludeId = "") {
  const result = await db
    .collection(COLLECTIONS.courses)
    .where({ orgId, name })
    .limit(20)
    .get();
  return result.data.find((course) => course.status !== "deleted" && course._id !== excludeId) || null;
}

async function findActiveStudentByNameAndCourse(orgId, name, courseId, excludeId = "") {
  const result = await db
    .collection(COLLECTIONS.students)
    .where({ orgId, name, courseId })
    .limit(20)
    .get();
  return result.data.find((student) => student.status !== "deleted" && student._id !== excludeId) || null;
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
      status: "active",
      note: "正常上课",
      targetDateText: "2026-06-20",
      operatedAtText: "2026-06-20 18:30",
      createdAtText: "2026-06-20 18:30",
      createdAt: now()
    }
  });
}

async function createOrgAndMembership(user, orgName = DEFAULT_ORG_NAME) {
  const membership = await findMembershipByUserId(user._id);

  if (membership) {
    throw new Error("当前微信用户已经加入机构");
  }

  const orgResult = await db.collection(COLLECTIONS.organizations).add({
    data: {
      name: String(orgName || DEFAULT_ORG_NAME).trim() || DEFAULT_ORG_NAME,
      ownerUserId: user._id,
      plan: "free_trial",
      createdAt: now(),
      updatedAt: now()
    }
  });

  const membershipData = {
    orgId: orgResult._id,
    userId: user._id,
    role: ROLES.admin,
    displayName: "管理员",
    phone: "",
    studentIds: [],
    status: "active",
    createdAt: now(),
    updatedAt: now()
  };
  const membershipResult = await db.collection(COLLECTIONS.memberships).add({
    data: membershipData
  });

  const createdMembership = { _id: membershipResult._id, ...membershipData };
  return createdMembership;
}

async function getContext(options = {}) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error("无法取得微信用户 openid");
  }

  const user = await ensureUser(openid);
  const membership = await findMembershipByUserId(user._id);
  if (!membership) {
    if (options.allowUnbound) {
      return {
        openid,
        user,
        membership: null,
        org: null,
        orgId: "",
        role: ""
      };
    }
    throw new Error("请先在“我的”页面创建新机构或输入绑定码加入机构");
  }

  const org = await first(COLLECTIONS.organizations, { _id: membership.orgId });

  return {
    openid,
    user,
    membership,
    org,
    orgId: membership.orgId,
    role: membership.role || ROLES.admin
  };
}

async function listCourses(orgId) {
  const result = await db
    .collection(COLLECTIONS.courses)
    .where({ orgId })
    .orderBy("createdAt", "asc")
    .get();
  return result.data
    .filter((course) => course.status !== "deleted")
    .map((course) => ({
      id: course._id,
      name: course.name,
      unit: course.unit
    }));
}

async function listStudents(orgId, context) {
  const result = await db
    .collection(COLLECTIONS.students)
    .where({ orgId, status: _.neq("deleted") })
    .orderBy("createdAt", "desc")
    .get();
  return result.data
    .filter((student) => isStudentVisibleToContext(context, student._id))
    .map((student) => ({
      id: student._id,
      name: student.name,
      guardian: student.guardian || "",
      phone: student.phone || "",
      courseId: student.courseId,
      remaining: Number(student.remaining || 0),
      status: student.status || "正常"
    }));
}

async function listRecords(orgId, context, filters = {}) {
  const result = await db
    .collection(COLLECTIONS.lessonRecords)
    .where({ orgId })
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();
  return result.data
    .filter((record) => isStudentVisibleToContext(context, record.studentId))
    .map((record) => {
      const targetDateText = record.targetDateText || (record.type === "checkin" ? String(record.createdAtText || "").slice(0, 10) : "");
      const operatedAtText = record.operatedAtText || record.createdAtText || "";
      const recordDate = record.type === "checkin" ? targetDateText : String(operatedAtText).slice(0, 10);
      const deltaHours = Number(record.deltaHours || 0);
      const direction = deltaHours >= 0 ? "plus" : "minus";
      const activeUndoTarget = ["checkin", "recharge"].includes(record.type) && record.status !== "undone";
      const permissions = getPermissions(context.role);
      const canUndo =
        activeUndoTarget &&
        ((record.type === "checkin" && permissions.canUndoCheckin) ||
          (record.type === "recharge" && permissions.canUndoRecharge));
      return {
        id: record._id,
        studentId: record.studentId,
        studentName: record.studentName,
        courseId: record.courseId || "",
        courseName: record.courseName,
        hours: Math.abs(Number(record.hours || deltaHours || 0)),
        direction,
        type: record.type,
        note: record.note || "",
        status: record.status || "active",
        canUndo,
        targetDateText,
        operatedAtText,
        undoneAtText: record.undoneAtText || "",
        createdAt: record.createdAtText || "",
        recordDate
      };
    })
    .filter((record) => !filters.studentId || record.studentId === filters.studentId)
    .filter((record) => !filters.courseId || record.courseId === filters.courseId)
    .filter((record) => !filters.date || record.recordDate === filters.date);
}

async function login() {
  const context = await getContext();
  return ok(
    decorateContext(
      {
        user: {
          id: context.user._id,
          nickname: context.user.nickname
        },
        org: {
          id: context.org._id,
          name: context.org.name,
          plan: context.org.plan
        }
      },
      context
    )
  );
}

async function dashboard() {
  const context = await getContext({ allowUnbound: true });
  if (!context.membership) {
    return ok(
      decorateUnbound({
        stats: {
          studentCount: 0,
          totalRemaining: 0,
          monthConsumed: 0,
          lowBalance: 0
        },
        recentRecords: []
      })
    );
  }
  const [students, records] = await Promise.all([listStudents(context.orgId, context), listRecords(context.orgId, context)]);
  const monthPrefix = formatDate().slice(0, 7);
  const totalRemaining = students.reduce((sum, item) => sum + Number(item.remaining || 0), 0);
  const monthConsumed = records
    .filter((record) => record.type === "checkin" && record.createdAt.startsWith(monthPrefix))
    .reduce((sum, record) => sum + Number(record.hours || 0), 0);
  const lowBalance = students.filter((item) => Number(item.remaining || 0) <= 3).length;

  return ok(
    decorateContext(
      {
        stats: {
          studentCount: students.length,
          totalRemaining: Number(totalRemaining.toFixed(2)),
          monthConsumed: Number(monthConsumed.toFixed(2)),
          lowBalance
        },
        recentRecords: records.slice(0, 5)
      },
      context
    )
  );
}

async function studentList() {
  const context = await getContext({ allowUnbound: true });
  if (!context.membership) {
    return ok(decorateUnbound({ students: [], courses: [] }));
  }
  const [students, courses] = await Promise.all([listStudents(context.orgId, context), listCourses(context.orgId)]);
  return ok(decorateContext({ students, courses }, context));
}

async function courseList() {
  const context = await getContext({ allowUnbound: true });
  if (!context.membership) {
    return ok(decorateUnbound({ courses: [] }));
  }
  const courses = await listCourses(context.orgId);
  return ok(decorateContext({ courses }, context));
}

async function courseCreate(payload) {
  const context = await getContext();
  assertAdmin(context);

  const name = String(payload.name || "").trim();
  const unit = Number(payload.unit || 0);
  if (!name) return fail("请填写课程名称");
  if (unit <= 0) return fail("默认课时必须大于 0");
  if (await findActiveCourseByName(context.orgId, name)) {
    return fail("课程名称已存在");
  }

  const result = await db.collection(COLLECTIONS.courses).add({
    data: {
      publicId: publicId("course"),
      orgId: context.orgId,
      name,
      unit,
      status: "enabled",
      createdAt: now(),
      updatedAt: now()
    }
  });

  await addOperationLog(context, "course_create", "course", result._id, { name, unit });
  return ok({ id: result._id });
}

async function courseUpdate(payload) {
  const context = await getContext();
  assertAdmin(context);

  const course = await first(COLLECTIONS.courses, {
    _id: payload.courseId,
    orgId: context.orgId
  });
  if (!course || course.status === "deleted") return fail("课程不存在");

  const name = String(payload.name || "").trim();
  const unit = Number(payload.unit || 0);
  if (!name) return fail("请填写课程名称");
  if (unit <= 0) return fail("默认课时必须大于 0");
  if (await findActiveCourseByName(context.orgId, name, course._id)) {
    return fail("课程名称已存在");
  }

  await db.collection(COLLECTIONS.courses).doc(course._id).update({
    data: {
      name,
      unit,
      updatedAt: now()
    }
  });

  await addOperationLog(context, "course_update", "course", course._id, { name, unit });
  return ok({});
}

async function courseDelete(payload) {
  const context = await getContext();
  assertAdmin(context);

  const course = await first(COLLECTIONS.courses, {
    _id: payload.courseId,
    orgId: context.orgId
  });
  if (!course || course.status === "deleted") return fail("课程不存在");

  const usedCount = await db
    .collection(COLLECTIONS.students)
    .where({
      orgId: context.orgId,
      courseId: course._id,
      status: _.neq("deleted")
    })
    .count();
  if (usedCount.total > 0) {
    return fail("已有学员使用该课程，不能删除");
  }

  await db.collection(COLLECTIONS.courses).doc(course._id).update({
    data: {
      status: "deleted",
      deletedAt: now(),
      updatedAt: now()
    }
  });

  await addOperationLog(context, "course_delete", "course", course._id, { name: course.name });
  return ok({});
}

async function studentCreate(payload) {
  const context = await getContext();
  assertAdmin(context);

  const name = String(payload.name || "").trim();
  if (!name) return fail("请填写学员姓名");

  const course = await first(COLLECTIONS.courses, {
    _id: payload.courseId,
    orgId: context.orgId
  });
  if (!course) return fail("课程不存在");
  if (await findActiveStudentByNameAndCourse(context.orgId, name, course._id)) {
    return fail("该课程下已存在同名学员");
  }

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

  await addOperationLog(context, "student_create", "student", result._id, { name, courseId: course._id });
  return ok({ id: result._id });
}

async function studentUpdate(payload) {
  const context = await getContext();
  assertAdmin(context);

  const student = await first(COLLECTIONS.students, {
    _id: payload.studentId,
    orgId: context.orgId
  });
  if (!student || student.status === "deleted") return fail("学员不存在");

  const name = String(payload.name || "").trim();
  if (!name) return fail("请填写学员姓名");

  const course = await first(COLLECTIONS.courses, {
    _id: payload.courseId,
    orgId: context.orgId
  });
  if (!course) return fail("课程不存在");
  if (await findActiveStudentByNameAndCourse(context.orgId, name, course._id, student._id)) {
    return fail("该课程下已存在同名学员");
  }

  await db.collection(COLLECTIONS.students).doc(student._id).update({
    data: {
      name,
      guardian: payload.guardian || "",
      phone: payload.phone || "",
      courseId: course._id,
      remaining: Number(payload.remaining || 0),
      updatedAt: now()
    }
  });

  await addOperationLog(context, "student_update", "student", student._id, { name, courseId: course._id });
  return ok({});
}

async function studentDelete(payload) {
  const context = await getContext();
  assertAdmin(context);

  const student = await first(COLLECTIONS.students, {
    _id: payload.studentId,
    orgId: context.orgId
  });
  if (!student || student.status === "deleted") return fail("学员不存在");

  await db.collection(COLLECTIONS.students).doc(student._id).update({
    data: {
      status: "deleted",
      deletedAt: now(),
      updatedAt: now()
    }
  });

  await addOperationLog(context, "student_delete", "student", student._id, { name: student.name });
  return ok({});
}

async function studentRecharge(payload) {
  const context = await getContext();
  assertAdmin(context);

  const hours = Number(payload.hours || 0);
  if (hours <= 0) return fail("充值课时必须大于 0");

  const student = await first(COLLECTIONS.students, {
    _id: payload.studentId,
    orgId: context.orgId
  });
  if (!student || student.status === "deleted") return fail("学员不存在");

  const balanceAfter = Number((Number(student.remaining || 0) + hours).toFixed(2));
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
      courseId: "",
      courseName: "课时充值",
      hours,
      deltaHours: hours,
      balanceAfter,
      type: "recharge",
      status: "active",
      note: "手动充值",
      operatorId: context.user._id,
      operatedAtText: formatDate(),
      createdAtText: formatDate(),
      createdAt: now()
    }
  });
  await addOperationLog(context, "student_recharge", "lesson_record", recordResult._id, {
    studentId: student._id,
    hours,
    balanceAfter
  });

  return ok({ balanceAfter });
}

async function lessonCheckin(payload) {
  const context = await getContext();
  assertCanCheckin(context);

  const hours = Number(payload.hours || 0);
  if (hours <= 0) return fail("扣减课时必须大于 0");

  const student = await first(COLLECTIONS.students, {
    _id: payload.studentId,
    orgId: context.orgId
  });
  if (!student || student.status === "deleted") return fail("学员不存在");
  if (!isStudentVisibleToContext(context, student._id)) return fail("当前角色不能操作该学员");

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

  const targetDateText = getCheckinTargetDateText(payload);
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
      status: "active",
      note: payload.note || "上课打卡",
      operatorId: context.user._id,
      targetDateText,
      operatedAtText: formatDate(),
      createdAtText: getCheckinTimeText(payload),
      createdAt: now()
    }
  });
  await addOperationLog(context, "lesson_checkin", "lesson_record", recordResult._id, {
    studentId: student._id,
    courseId: course._id,
    hours,
    balanceAfter,
    targetDateText
  });

  return ok({ id: recordResult._id, balanceAfter });
}

async function recordList(payload = {}) {
  const context = await getContext({ allowUnbound: true });
  if (!context.membership) {
    return ok(decorateUnbound({ records: [] }));
  }
  const records = await listRecords(context.orgId, context, payload);
  return ok(decorateContext({ records }, context));
}

async function recordUndo(payload) {
  const context = await getContext();

  const record = await first(COLLECTIONS.lessonRecords, {
    _id: payload.recordId,
    orgId: context.orgId
  });
  if (!record) return fail("课时记录不存在");
  if (!["checkin", "recharge"].includes(record.type)) return fail("该记录不支持撤销");
  if (record.status === "undone") return fail("该记录已撤销");
  if (!isStudentVisibleToContext(context, record.studentId)) return fail("当前角色不能操作该记录");
  assertCanUndoRecord(context, record);

  const student = await first(COLLECTIONS.students, {
    _id: record.studentId,
    orgId: context.orgId
  });
  if (!student || student.status === "deleted") return fail("学员不存在");

  const hours = Math.abs(Number(record.hours || record.deltaHours || 0));
  const currentRemaining = Number(student.remaining || 0);
  const isRecharge = record.type === "recharge";
  const balanceAfter = Number((isRecharge ? currentRemaining - hours : currentRemaining + hours).toFixed(2));
  if (balanceAfter < 0) return fail("撤销后课时不能小于 0");

  await db.collection(COLLECTIONS.students).doc(student._id).update({
    data: {
      remaining: balanceAfter,
      updatedAt: now()
    }
  });

  await db.collection(COLLECTIONS.lessonRecords).doc(record._id).update({
    data: {
      status: "undone",
      undoneAtText: formatDate(),
      undoneBy: context.user._id,
      updatedAt: now()
    }
  });

  const undoType = isRecharge ? "undo_recharge" : "undo_checkin";
  const undoRecordResult = await db.collection(COLLECTIONS.lessonRecords).add({
    data: {
      publicId: publicId("rec"),
      orgId: context.orgId,
      studentId: student._id,
      studentName: record.studentName || student.name,
      courseId: record.courseId || "",
      courseName: record.courseName || (isRecharge ? "撤销充值" : "撤销打卡"),
      hours,
      deltaHours: isRecharge ? -hours : hours,
      balanceAfter,
      type: undoType,
      status: "active",
      note: isRecharge ? "撤销充值" : "撤销打卡",
      originalRecordId: record._id,
      operatorId: context.user._id,
      targetDateText: record.targetDateText || "",
      operatedAtText: formatDate(),
      createdAtText: formatDate(),
      createdAt: now()
    }
  });

  await addOperationLog(context, "lesson_record_undo", "lesson_record", record._id, {
    undoRecordId: undoRecordResult._id,
    originalType: record.type,
    studentId: student._id,
    hours,
    balanceAfter
  });

  return ok({ balanceAfter });
}

async function operationLogList() {
  const context = await getContext();
  assertAdmin(context);

  const result = await db
    .collection(COLLECTIONS.operationLogs)
    .where({ orgId: context.orgId })
    .orderBy("createdAt", "desc")
    .limit(30)
    .get();
  const logs = result.data.map((log) => ({
    id: log._id,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    operatorName: log.operatorName || "",
    operatedAtText: log.operatedAtText || "",
    detail: log.detail || {}
  }));
  return ok(decorateContext({ logs }, context));
}

async function profileGet() {
  const context = await getContext({ allowUnbound: true });
  if (!context.membership) {
    return ok(
      decorateUnbound({
        org: {
          id: "",
          name: "未加入机构",
          plan: ""
        },
        membership: {
          id: "",
          displayName: "未绑定"
        },
        totals: {
          studentCount: 0,
          recordCount: 0
        }
      })
    );
  }
  const [students, records] = await Promise.all([listStudents(context.orgId, context), listRecords(context.orgId, context)]);
  return ok(
    decorateContext(
      {
        org: {
          id: context.org._id,
          name: context.org.name,
          plan: context.org.plan
        },
        membership: {
          id: context.membership._id,
          displayName: context.membership.displayName || getRoleName(context.role)
        },
        totals: {
          studentCount: students.length,
          recordCount: records.length
        }
      },
      context
    )
  );
}

async function orgCreate(payload = {}) {
  const context = await getContext({ allowUnbound: true });
  if (context.membership) return fail("当前微信用户已经加入机构");

  const membership = await createOrgAndMembership(context.user, payload.orgName || DEFAULT_ORG_NAME);
  return ok({
    orgId: membership.orgId,
    role: membership.role,
    roleName: getRoleName(membership.role)
  });
}

async function feedbackCreate(payload = {}) {
  const context = await getContext({ allowUnbound: true });
  const content = String(payload.content || "").trim();
  const contact = String(payload.contact || "").trim();

  if (!content) return fail("请输入反馈内容");
  if (content.length > 1000) return fail("反馈内容不能超过 1000 字");
  if (contact.length > 100) return fail("联系方式不能超过 100 字");

  const result = await db.collection(COLLECTIONS.feedbacks).add({
    data: {
      publicId: publicId("feedback"),
      orgId: context.orgId || "",
      orgName: context.org ? context.org.name : "",
      userId: context.user._id,
      openid: context.openid,
      role: context.role || "",
      roleName: context.role ? getRoleName(context.role) : "未加入机构",
      content,
      contact,
      status: "new",
      submittedAtText: formatDate(),
      createdAt: now(),
      updatedAt: now()
    }
  });

  return ok({ id: result._id });
}

function normalizeStudentIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

async function memberList() {
  const context = await getContext();
  assertAdmin(context);
  const result = await db
    .collection(COLLECTIONS.memberships)
    .where({ orgId: context.orgId, status: "active" })
    .orderBy("createdAt", "asc")
    .get();
  const members = result.data.map((member) => ({
    id: member._id,
    displayName: member.displayName || getRoleName(member.role),
    phone: member.phone || "",
    role: member.role || ROLES.teacher,
    roleName: getRoleName(member.role),
    studentIds: Array.isArray(member.studentIds) ? member.studentIds : [],
    inviteCode: member.inviteCode || "",
    isCurrentUser: member.userId === context.user._id,
    isBound: Boolean(member.userId)
  }));
  return ok(decorateContext({ members }, context));
}

async function validateMemberPayload(context, payload, existingId = "") {
  const displayName = String(payload.displayName || "").trim();
  const phone = String(payload.phone || "").trim();
  const role = String(payload.role || "").trim();
  const studentIds = normalizeStudentIds(payload.studentIds);

  if (!displayName) return { error: "请填写成员姓名" };
  if (![ROLES.admin, ROLES.teacher, ROLES.parent].includes(role)) return { error: "请选择正确角色" };
  if (role === ROLES.parent && studentIds.length === 0) return { error: "家长必须绑定至少一个学员" };

  const sameName = await first(COLLECTIONS.memberships, {
    orgId: context.orgId,
    displayName,
    status: "active"
  });
  if (sameName && sameName._id !== existingId) return { error: "成员姓名已存在" };

  for (const studentId of studentIds) {
    const student = await first(COLLECTIONS.students, {
      _id: studentId,
      orgId: context.orgId
    });
    if (!student || student.status === "deleted") return { error: "绑定的学员不存在" };
  }

  return {
    displayName,
    phone,
    role,
    studentIds: role === ROLES.parent ? studentIds : []
  };
}

async function memberCreate(payload) {
  const context = await getContext();
  assertAdmin(context);

  const validated = await validateMemberPayload(context, payload);
  if (validated.error) return fail(validated.error);

  const result = await db.collection(COLLECTIONS.memberships).add({
    data: {
      orgId: context.orgId,
      userId: "",
      inviteCode: publicId("join"),
      ...validated,
      status: "active",
      createdAt: now(),
      updatedAt: now()
    }
  });

  await addOperationLog(context, "member_create", "membership", result._id, validated);
  return ok({ id: result._id });
}

async function memberBind(payload) {
  const context = await getContext({ allowUnbound: true });
  const inviteCode = String(payload.inviteCode || "").trim();
  if (!inviteCode) return fail("请输入绑定码");

  const target = await first(COLLECTIONS.memberships, {
    inviteCode,
    status: "active"
  });
  if (!target) return fail("绑定码不存在或已失效");
  if (target.userId && target.userId !== context.user._id) return fail("该成员已绑定其他微信用户");

  await db.collection(COLLECTIONS.memberships).doc(target._id).update({
    data: {
      userId: context.user._id,
      updatedAt: now()
    }
  });

  if (context.membership && context.membership._id !== target._id && context.membership.userId === context.user._id) {
    await db.collection(COLLECTIONS.memberships).doc(context.membership._id).update({
      data: {
        status: "deleted",
        deletedAt: now(),
        updatedAt: now()
      }
    });
  }

  return ok({});
}

async function memberUpdate(payload) {
  const context = await getContext();
  assertAdmin(context);

  const member = await first(COLLECTIONS.memberships, {
    _id: payload.memberId,
    orgId: context.orgId
  });
  if (!member || member.status !== "active") return fail("成员不存在");

  const validated = await validateMemberPayload(context, payload, member._id);
  if (validated.error) return fail(validated.error);
  if (member.userId === context.user._id && validated.role !== ROLES.admin) {
    return fail("不能把当前登录管理员改成非管理员");
  }

  await db.collection(COLLECTIONS.memberships).doc(member._id).update({
    data: {
      ...validated,
      updatedAt: now()
    }
  });

  await addOperationLog(context, "member_update", "membership", member._id, validated);
  return ok({});
}

async function memberDelete(payload) {
  const context = await getContext();
  assertAdmin(context);

  const member = await first(COLLECTIONS.memberships, {
    _id: payload.memberId,
    orgId: context.orgId
  });
  if (!member || member.status !== "active") return fail("成员不存在");
  if (member.userId === context.user._id) return fail("不能删除当前登录管理员");

  await db.collection(COLLECTIONS.memberships).doc(member._id).update({
    data: {
      status: "deleted",
      deletedAt: now(),
      updatedAt: now()
    }
  });

  await addOperationLog(context, "member_delete", "membership", member._id, {
    displayName: member.displayName || ""
  });
  return ok({});
}

async function resetDemoData() {
  const context = await getContext();
  assertAdmin(context);

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
      courseCreate,
      courseDelete,
      courseList,
      courseUpdate,
      dashboard,
      feedbackCreate,
      lessonCheckin,
      login,
      memberCreate,
      memberDelete,
      memberBind,
      memberList,
      memberUpdate,
      operationLogList,
      orgCreate,
      profileGet,
      recordList,
      recordUndo,
      resetDemoData,
      studentCreate,
      studentDelete,
      studentList,
      studentRecharge,
      studentUpdate
    };

    if (!handlers[action]) {
      return fail("未知接口");
    }

    return await handlers[action](payload);
  } catch (error) {
    return fail(error.message || "服务器错误", "SERVER_ERROR");
  }
};
