import { CategoriesManager } from "@/features/categories/CategoriesManager";

export default function CategoriesPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Categorías</h1>
      <CategoriesManager />
    </section>
  );
}
