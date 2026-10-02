/**
 * PostgREST devuelve 1000 filas como mucho: se pide por páginas hasta que una
 * llega incompleta. La consulta debe ordenar por una clave única, o las páginas
 * se solapan y pierden filas.
 */
export async function todas<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await pagina(desde, desde + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
