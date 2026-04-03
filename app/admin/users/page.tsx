"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  type AdminUserRow,
  type ApiSection,
  createUserRequest,
  deleteAdminUser,
  generateClientPassword,
  listAdminUsers,
  type Role,
  setAdminUserPassword,
  updateAdminUser,
} from "@/lib/auth";

import { AdminNav } from "@/components/admin/AdminNav";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserMenu } from "@/components/auth/UserMenu";
import { EditLayout } from "@/components/EditLayout";

const SECTION_OPTIONS: { key: ApiSection; label: string }[] = [
  { key: "gpr", label: "ГПР" },
  { key: "tenders", label: "Тендеры" },
  { key: "materials", label: "ТМЦ" },
];

function sectionsCellRu(sections: ApiSection[]): string {
  if (sections.length === 0) return "—";
  return sections
    .map((s) => SECTION_OPTIONS.find((o) => o.key === s)?.label ?? s)
    .join(", ");
}

function roleLabelRu(role: Role): string {
  if (role === "admin") return "Администратор";
  if (role === "manager") return "Руководитель";
  return "Сотрудник";
}

type ModalShellProps = {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
};

function ModalShell({ title, children, onClose, footer }: ModalShellProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 id="modal-title" className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

type PasswordOnceKind = "create" | "reset";

function PasswordOnceModal({
  kind,
  plain,
  onClose,
}: {
  kind: PasswordOnceKind;
  plain: string;
  onClose: () => void;
}) {
  const title = kind === "create" ? "Пользователь создан" : "Пароль сброшен";
  return (
    <ModalShell
      title={title}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(plain)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Скопировать пароль
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Закрыть
          </button>
        </>
      }
    >
      <p className="text-sm font-medium text-slate-800">Пароль:</p>
      <p className="mt-2 break-all rounded-lg bg-slate-100 px-3 py-2.5 font-mono text-sm text-slate-900">{plain}</p>
      <p className="mt-4 text-sm text-amber-800">
        Сохраните пароль — он больше не будет показан.
      </p>
    </ModalShell>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { hydrated, token, isAdmin, isManager, canAccessAdminPanel } = useAuth();
  const managerOnly = isManager && !isAdmin;
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createFullName, setCreateFullName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<Role>("employee");
  const [createSections, setCreateSections] = useState<Record<ApiSection, boolean>>({
    gpr: true,
    tenders: false,
    materials: false,
  });
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [passwordOnce, setPasswordOnce] = useState<{ kind: PasswordOnceKind; plain: string } | null>(null);

  const [editUser, setEditUser] = useState<AdminUserRow | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editRole, setEditRole] = useState<Role>("employee");
  const [editSections, setEditSections] = useState<Record<ApiSection, boolean>>({
    gpr: false,
    tenders: false,
    materials: false,
  });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [resetConfirmUser, setResetConfirmUser] = useState<AdminUserRow | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const [deleteUser, setDeleteUser] = useState<AdminUserRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setListError(null);
    setListLoading(true);
    try {
      const rows = await listAdminUsers(token);
      setUsers(rows);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Не удалось загрузить список");
    } finally {
      setListLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) return;
    if (!canAccessAdminPanel) {
      router.replace("/");
      return;
    }
    void loadUsers();
  }, [hydrated, token, canAccessAdminPanel, router, loadUsers]);

  useEffect(() => {
    if (!editUser) return;
    setEditFullName(editUser.full_name ?? "");
    setEditRole(editUser.role);
    setEditSections({
      gpr: editUser.allowed_sections.includes("gpr"),
      tenders: editUser.allowed_sections.includes("tenders"),
      materials: editUser.allowed_sections.includes("materials"),
    });
    setEditError(null);
  }, [editUser]);

  useEffect(() => {
    if (createRole === "manager") {
      setCreateSections({ gpr: true, tenders: true, materials: true });
    }
  }, [createRole]);

  useEffect(() => {
    if (!editUser) return;
    if (editRole === "manager") {
      setEditSections({ gpr: true, tenders: true, materials: true });
    }
  }, [editRole, editUser]);

  function openCreate() {
    setCreateEmail("");
    setCreateFullName("");
    setCreatePassword("");
    setCreateRole("employee");
    setCreateSections({ gpr: true, tenders: false, materials: false });
    setCreateError(null);
    setCreateOpen(true);
  }

  function toggleCreateSection(key: ApiSection) {
    setCreateSections((s) => ({ ...s, [key]: !s[key] }));
  }

  function toggleEditSection(key: ApiSection) {
    setEditSections((s) => ({ ...s, [key]: !s[key] }));
  }

  async function onCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setCreateError(null);
    setCreateBusy(true);
    let plain = createPassword.trim();
    if (!plain) plain = generateClientPassword();
    if (plain.length < 6) {
      setCreateError("Пароль не короче 6 символов или оставьте поле пустым для автоматической генерации.");
      setCreateBusy(false);
      return;
    }
    const allowed_sections = SECTION_OPTIONS.filter((o) => createSections[o.key]).map((o) => o.key);
    try {
      await createUserRequest(token, {
        email: createEmail.trim(),
        password: plain,
        ...(createFullName.trim() ? { full_name: createFullName.trim() } : {}),
        role: createRole,
        allowed_sections,
      });
      setCreateOpen(false);
      setCreateEmail("");
      setCreateFullName("");
      setCreatePassword("");
      setPasswordOnce({ kind: "create", plain });
      await loadUsers();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setCreateBusy(false);
    }
  }

  async function onEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !editUser) return;
    setEditError(null);
    setEditBusy(true);
    const allowed_sections = SECTION_OPTIONS.filter((o) => editSections[o.key]).map((o) => o.key);
    try {
      await updateAdminUser(token, editUser.id, {
        full_name: editFullName.trim() || null,
        role: editRole,
        allowed_sections,
      });
      setEditUser(null);
      await loadUsers();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setEditBusy(false);
    }
  }

  async function onResetConfirm() {
    if (!token || !resetConfirmUser) return;
    setResetError(null);
    setResetBusy(true);
    const plain = generateClientPassword();
    try {
      await setAdminUserPassword(token, resetConfirmUser.id, plain);
      setResetConfirmUser(null);
      setPasswordOnce({ kind: "reset", plain });
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setResetBusy(false);
    }
  }

  async function onDeleteConfirm() {
    if (!token || !deleteUser) return;
    setDeleteError(null);
    setDeleteBusy(true);
    try {
      await deleteAdminUser(token, deleteUser.id);
      setDeleteUser(null);
      await loadUsers();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setDeleteBusy(false);
    }
  }

  if (!hydrated || !token || !canAccessAdminPanel) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Проверка доступа…
      </div>
    );
  }

  return (
    <main className="mx-auto min-h-[60vh] max-w-7xl space-y-4 bg-slate-50 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            ← Админ-панель
          </Link>
          <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Главная
          </Link>
        </div>
        <UserMenu />
      </div>

      <AdminNav />

      <EditLayout
        title="Пользователи"
        subtitle="Учётные записи, роли и доступ к разделам. Сохранённые пароли не запрашиваются и не отображаются."
        showActions={false}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Коды разделов: <span className="font-mono text-slate-800">gpr</span>,{" "}
            <span className="font-mono text-slate-800">tenders</span>,{" "}
            <span className="font-mono text-slate-800">materials</span>
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Создать пользователя
          </button>
        </div>

        {listError ? <p className="text-sm text-red-600">{listError}</p> : null}

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 font-semibold text-slate-800">Email</th>
                <th className="px-4 py-3 font-semibold text-slate-800">ФИО</th>
                <th className="px-4 py-3 font-semibold text-slate-800">Роль</th>
                <th className="px-4 py-3 font-semibold text-slate-800">Доступные разделы</th>
                <th className="px-4 py-3 font-semibold text-slate-800">Действия</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Загрузка…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Пользователей пока нет
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-900">{u.email}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-slate-800" title={u.full_name ?? undefined}>
                      {u.full_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-800">{roleLabelRu(u.role)}</td>
                    <td className="px-4 py-3 text-slate-700">{sectionsCellRu(u.allowed_sections)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setEditUser(u)}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Редактировать
                        </button>
                        {!(managerOnly && u.role === "admin") ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setResetConfirmUser(u);
                                setResetError(null);
                              }}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Сбросить пароль
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteUser(u);
                                setDeleteError(null);
                              }}
                              className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                            >
                              Удалить
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </EditLayout>

      {createOpen ? (
        <ModalShell
          title="Создать пользователя"
          onClose={() => !createBusy && setCreateOpen(false)}
          footer={
            <>
              <button
                type="button"
                disabled={createBusy}
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                form="create-user-form"
                disabled={createBusy}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {createBusy ? "Создание…" : "Создать"}
              </button>
            </>
          }
        >
          <form id="create-user-form" onSubmit={onCreateSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                required
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">ФИО</label>
              <input
                type="text"
                value={createFullName}
                onChange={(e) => setCreateFullName(e.target.value)}
                placeholder="Иванов Иван Иванович"
                autoComplete="name"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Пароль</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="Пусто — будет создан автоматически"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setCreatePassword(generateClientPassword())}
                  className="shrink-0 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
                >
                  Сгенерировать
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">Не короче 6 символов. После создания пароль покажется один раз.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Роль</label>
              <select
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value as Role)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              >
                {isAdmin ? <option value="admin">Администратор</option> : null}
                <option value="manager">Руководитель</option>
                <option value="employee">Сотрудник</option>
              </select>
            </div>
            <fieldset
              disabled={createRole === "manager"}
              className={createRole === "manager" ? "opacity-90" : undefined}
            >
              <legend className="text-sm font-medium text-slate-700">Доступные разделы</legend>
              {createRole === "manager" ? (
                <p className="mt-1 text-xs text-slate-500">Для руководителя назначаются все разделы автоматически.</p>
              ) : null}
              <div className="mt-2 space-y-2">
                {SECTION_OPTIONS.map((o) => (
                  <label key={o.key} className="flex items-center gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={createSections[o.key]}
                      onChange={() => toggleCreateSection(o.key)}
                    />
                    <span className="text-slate-700">{o.label}</span>
                    <span className="font-mono text-xs text-slate-500">({o.key})</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {createError ? <p className="text-sm text-red-600">{createError}</p> : null}
          </form>
        </ModalShell>
      ) : null}

      {passwordOnce ? (
        <PasswordOnceModal
          kind={passwordOnce.kind}
          plain={passwordOnce.plain}
          onClose={() => setPasswordOnce(null)}
        />
      ) : null}

      {editUser ? (
        <ModalShell
          title={`Редактировать: ${editUser.email}`}
          onClose={() => !editBusy && setEditUser(null)}
          footer={
            <>
              <button
                type="button"
                disabled={editBusy}
                onClick={() => setEditUser(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                form="edit-user-form"
                disabled={editBusy}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {editBusy ? "Сохранение…" : "Сохранить"}
              </button>
            </>
          }
        >
          <form id="edit-user-form" onSubmit={onEditSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">ФИО</label>
              <input
                type="text"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                placeholder="Иванов Иван Иванович"
                autoComplete="name"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              />
            </div>
            {managerOnly && editUser.role === "admin" ? (
              <p className="text-sm text-slate-600">
                Роль и разделы администратора может менять только администратор. Доступно редактирование ФИО.
              </p>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Роль</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as Role)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  >
                    {isAdmin ? <option value="admin">Администратор</option> : null}
                    <option value="manager">Руководитель</option>
                    <option value="employee">Сотрудник</option>
                  </select>
                </div>
                <fieldset>
                  <legend className="text-sm font-medium text-slate-700">Доступные разделы</legend>
                  <div className="mt-2 space-y-2">
                    {SECTION_OPTIONS.map((o) => (
                      <label key={o.key} className="flex items-center gap-2 text-sm text-slate-800">
                        <input
                          type="checkbox"
                          checked={editSections[o.key]}
                          onChange={() => toggleEditSection(o.key)}
                        />
                        <span className="text-slate-700">{o.label}</span>
                        <span className="font-mono text-xs text-slate-500">({o.key})</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
            {editError ? <p className="text-sm text-red-600">{editError}</p> : null}
          </form>
        </ModalShell>
      ) : null}

      {resetConfirmUser ? (
        <ModalShell
          title="Сбросить пароль"
          onClose={() => !resetBusy && setResetConfirmUser(null)}
          footer={
            <>
              <button
                type="button"
                disabled={resetBusy}
                onClick={() => setResetConfirmUser(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={resetBusy}
                onClick={() => void onResetConfirm()}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {resetBusy ? "Сброс…" : "Сбросить пароль"}
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-700">
            Будет сгенерирован новый пароль для <strong>{resetConfirmUser.email}</strong>. Текущий пароль недоступен для
            просмотра — пользователь войдёт только с новым паролем после того, как вы его передадите.
          </p>
          {resetError ? <p className="mt-3 text-sm text-red-600">{resetError}</p> : null}
        </ModalShell>
      ) : null}

      {deleteUser ? (
        <ModalShell
          title="Удалить пользователя?"
          onClose={() => !deleteBusy && setDeleteUser(null)}
          footer={
            <>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteUser(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void onDeleteConfirm()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteBusy ? "Удаление…" : "Удалить"}
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-700">
            Будет удалена учётная запись <strong>{deleteUser.email}</strong>. Действие необратимо.
          </p>
          {deleteError ? <p className="mt-3 text-sm text-red-600">{deleteError}</p> : null}
        </ModalShell>
      ) : null}
    </main>
  );
}
