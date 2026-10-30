import {
  AlarmClock, BookOpen, Cake, Calendar, CreditCard, Plane, Users, UtensilsCrossed, ChartColumn, ClipboardCheck, Clock, Dumbbell, GraduationCap, House, Images, Layers, LayoutDashboard,
  LayoutGrid, ListChecks, MessageCircleHeart, Music, NotebookPen, Pencil, Receipt, Repeat, Rocket, Search, Settings, ShoppingCart,
  Smile, Sparkles, Target, Timer, Tv, Wallet, WandSparkles, Zap, type LucideIcon,
} from 'lucide-react';
import type { NavItem, WidgetId } from '../types';

/** Ein Symbol pro Bereich – in Sidebar, Bereichsleiste, Suche und Dashboard gleich */
export const PAGE_ICONS: Record<string, LucideIcon> = {
  dashboard: House,
  kalender: Calendar,
  aufgaben: ListChecks,
  notizen: NotebookPen,
  gewohnheiten: Repeat,
  wecker: AlarmClock,
  rueckblick: Smile,
  ziele: Target,
  projekte: Rocket,
  training: Dumbbell,
  finanzen: Wallet,
  einkauf: ShoppingCart,
  abos: CreditCard,
  essen: UtensilsCrossed,
  menschen: Users,
  reisen: Plane,
  kurse: GraduationCap,
  lernen: Layers,
  pruefungen: ClipboardCheck,
  noten: ChartColumn,
  fokus: Timer,
  musik: Music,
  schauen: Tv,
  lesen: BookOpen,
  alben: Images,
  tools: LayoutGrid,
  einstellungen: Settings,
  suche: Search,
  assistentin: WandSparkles,
  bearbeiten: Pencil,
  'dashboard-bearbeiten': LayoutDashboard,
};

export const WIDGET_ICONS: Partial<Record<WidgetId, LucideIcon>> = {
  stats: ChartColumn,
  clock: Clock,
  quick: Zap,
  notes: NotebookPen,
  music: Music,
  tools: LayoutGrid,
  tasks: ListChecks,
  projects: Rocket,
  transactions: Receipt,
  watching: Tv,
  reading: BookOpen,
  habits: Sparkles,
  period: Clock,
  exams: ClipboardCheck,
  trainings: Dumbbell,
  calendar: Calendar,
  courses: GraduationCap,
  albums: Images,
  vision: Target,
  rings: Repeat,
  focus: Timer,
  budget: Wallet,
  shopping: ShoppingCart,
  review: MessageCircleHeart,
  birthdays: Cake,
  meals: UtensilsCrossed,
  trip: Plane,
};

export function Icon({ icon: Glyph, size = 18 }: { icon: LucideIcon; size?: number }) {
  return <Glyph size={size} strokeWidth={1.9} aria-hidden="true" className="lucide-icon" />;
}

/** Symbol eines Sidebar-Eintrags: eigenes Emoji, wenn gesetzt – sonst das Linien-Symbol */
export function NavIcon({ item, size = 19 }: { item: Pick<NavItem, 'path' | 'icon'>; size?: number }) {
  if (item.icon.trim()) return <span className="nav-emoji" aria-hidden>{item.icon}</span>;
  const Glyph = PAGE_ICONS[item.path] ?? LayoutGrid;
  return <Icon icon={Glyph} size={size} />;
}

/** Entfernt ein führendes Emoji aus Titeln wie „✅ Aufgaben“ */
export const stripEmoji = (text: string) => text.replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}️‍\s]+/u, '');

/** Das neue Logo (A) */
export function Logo({ size = 26 }: { size?: number }) {
  return <img className="brand-logo" src={`${import.meta.env.BASE_URL}icons/logo-64.png`} width={size} height={size} alt="" />;
}
