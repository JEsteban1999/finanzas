"use client";

import { useState, type FormEvent } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormError } from "@/components/FormError";
import {
  type Category, type CategoryKind,
  useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory,
} from "./api";

function CategoryRow({ category }: { category: Category }) {
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(category.name);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    try {
      await update.mutateAsync({ id: category.id, name });
      setRenaming(false);
    } catch {
      // Error visible abajo.
    }
  }

  return (
    <li className="flex flex-col gap-1 border-b py-2">
      <span>{category.name}{category.archived ? " · archivada" : ""}</span>
      {renaming ? (
        <form onSubmit={saveName} className="flex gap-2">
          <label>
            Nuevo nombre
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <button type="submit">Guardar</button>
          <button type="button" onClick={() => setRenaming(false)}>Cancelar</button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setRenaming(true)}>Renombrar</button>
          <button type="button" onClick={() => update.mutate({ id: category.id, archived: !category.archived })}>
            {category.archived ? "Restaurar" : "Archivar"}
          </button>
          <ConfirmButton label="Borrar" onConfirm={() => remove.mutate(category.id)} />
        </div>
      )}
      <FormError error={update.error ?? remove.error} />
    </li>
  );
}

const GROUPS: { kind: CategoryKind; title: string }[] = [
  { kind: "expense", title: "Gastos" },
  { kind: "income", title: "Ingresos" },
];

export function CategoriesManager() {
  const [showArchived, setShowArchived] = useState(false);
  const categories = useCategories(showArchived);
  const create = useCreateCategory();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("expense");

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    try {
      await create.mutateAsync({ name, kind });
      setName("");
    } catch {
      // Error visible abajo.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex gap-2">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Mostrar archivadas
      </label>
      <FormError error={categories.error} />
      {GROUPS.map((group) => (
        <section key={group.kind} aria-label={group.title}>
          <h2>{group.title}</h2>
          <ul>
            {categories.data?.filter((c) => c.kind === group.kind).map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </ul>
        </section>
      ))}
      <form onSubmit={onCreate} className="flex flex-col gap-2">
        <h2>Nueva categoría</h2>
        <label className="flex flex-col">
          Nombre de la categoría
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="flex flex-col">
          Clase
          <select value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)}>
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
          </select>
        </label>
        <FormError error={create.error} />
        <button type="submit" disabled={create.isPending}>Agregar categoría</button>
      </form>
    </div>
  );
}
