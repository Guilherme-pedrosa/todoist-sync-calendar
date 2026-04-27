// Paleta oficial do Todoist convertida para HSL
export interface ColorOption {
  name: string;
  label: string;
  hsl: string;
}

export const TODOIST_COLORS: ColorOption[] = [
  { name: 'berry_red',   label: 'Vermelho framboesa', hsl: 'hsl(348, 83%, 47%)' },
  { name: 'red',         label: 'Vermelho',           hsl: 'hsl(0, 72%, 51%)' },
  { name: 'orange',      label: 'Laranja',            hsl: 'hsl(24, 95%, 53%)' },
  { name: 'yellow',      label: 'Amarelo',            hsl: 'hsl(45, 93%, 47%)' },
  { name: 'olive_green', label: 'Verde-oliva',        hsl: 'hsl(80, 50%, 40%)' },
  { name: 'lime_green',  label: 'Verde-lima',         hsl: 'hsl(90, 60%, 45%)' },
  { name: 'green',       label: 'Verde',              hsl: 'hsl(142, 71%, 45%)' },
  { name: 'mint_green',  label: 'Verde-menta',        hsl: 'hsl(160, 60%, 50%)' },
  { name: 'teal',        label: 'Verde-azulado',      hsl: 'hsl(180, 70%, 40%)' },
  { name: 'sky_blue',    label: 'Azul-céu',           hsl: 'hsl(200, 85%, 55%)' },
  { name: 'light_blue',  label: 'Azul-claro',         hsl: 'hsl(210, 90%, 65%)' },
  { name: 'blue',        label: 'Azul',               hsl: 'hsl(217, 91%, 60%)' },
  { name: 'grape',       label: 'Uva',                hsl: 'hsl(280, 60%, 50%)' },
  { name: 'violet',      label: 'Violeta',            hsl: 'hsl(262, 60%, 55%)' },
  { name: 'lavender',    label: 'Lavanda',            hsl: 'hsl(270, 50%, 70%)' },
  { name: 'magenta',     label: 'Magenta',            hsl: 'hsl(320, 70%, 55%)' },
  { name: 'salmon',      label: 'Salmão',             hsl: 'hsl(10, 75%, 65%)' },
  { name: 'charcoal',    label: 'Carvão',             hsl: 'hsl(220, 10%, 30%)' },
  { name: 'grey',        label: 'Cinza',              hsl: 'hsl(220, 10%, 50%)' },
  { name: 'taupe',       label: 'Castanho-claro',     hsl: 'hsl(30, 15%, 50%)' },
];

export const DEFAULT_PROJECT_COLOR = 'hsl(220, 10%, 50%)';

export const findColorOption = (hsl: string): ColorOption | undefined =>
  TODOIST_COLORS.find((c) => c.hsl === hsl);
