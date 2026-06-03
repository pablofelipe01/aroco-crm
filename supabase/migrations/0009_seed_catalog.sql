-- ============================================================================
--  AROCO · 0009 — Catalog seeds (team_members + commission_rules)
--  Idempotent: re-running does not duplicate.
-- ============================================================================

insert into public.team_members (name, role_title, department, color) values
  ('Nicolás Rodríguez',   'Dir. Internacional',   'Comercial',      '#1B4332'),
  ('Álvaro Acosta',       'Gerente General',      'Dirección',      '#2D6A4F'),
  ('Ángela María Acosta', 'Operaciones',          'Administrativo', '#40916C'),
  ('Luis Ernesto Barrios','Finanzas',             'Financiero',     '#1E40AF'),
  ('John Muñoz',          'Dir. Comercial',       'Comercial',      '#52B788'),
  ('Milena Soto',         'RRHH / Operaciones',   'Administrativo', '#B45309'),
  ('John Saenz',          'Calidad / Finca',      'Finca',          '#74A57F'),
  ('Juan Carlos',         'Finca',                'Finca',          '#95D5B2'),
  ('Juan David Alarcón',  'Operaciones',          'Administrativo', '#6B8F71'),
  ('Joscha Herold',       'Diseño / Web',         'Administrativo', '#9B6A4F'),
  ('Maximilian Werner',   'Socio Europa',         'Dirección',      '#3D5A40'),
  ('Fernando Mejía Paz',  'Bodega',               'Bodega Central', '#7B5E3B')
on conflict (lower(name)) do nothing;

-- Commission rules — Mercado × Nivel (SPEC §6 / §8.2). pct_full as ratio.
insert into public.commission_rules (market, level, pct_full) values
  ('Nacional',      'Senior', 0.05),
  ('Nacional',      'Junior', 0.03),
  ('Internacional', 'Senior', 0.08),
  ('Internacional', 'Junior', 0.06)
on conflict (market, level) do nothing;
