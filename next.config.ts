import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in the home dir was being
  // detected and confusing Turbopack's root inference.
  turbopack: {
    root: __dirname,
  },

  /**
   * Atajos del portal de proveedores.
   *
   * `/registro` es la dirección que uno teclea sin pensar, y es la que hay que
   * poder dictar por teléfono a un proveedor. `/portal/registro` es correcta
   * pero se equivoca fácil — de hecho así apareció este atajo.
   */
  /**
   * El enlace de firma lleva la llave en la URL: que no viaje en el Referer
   * cuando quien firma abre otra página desde ahí.
   */
  async headers() {
    return [
      {
        source: "/firmar/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },

  async redirects() {
    return [
      { source: "/registro", destination: "/portal/registro", permanent: false },
      { source: "/proveedor", destination: "/portal", permanent: false },
    ];
  },
};

export default nextConfig;
