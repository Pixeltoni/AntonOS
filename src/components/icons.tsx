import {
  MoonStar,
  AlarmClock, BookOpen, Cake, Calendar, CalendarRange, CreditCard, Plane, Users, UtensilsCrossed, ChartColumn, ClipboardCheck, Clock, Dumbbell, GraduationCap, House, Images, Layers, LayoutDashboard,
  LayoutGrid, ListChecks, MessageCircleHeart, Music, NotebookPen, Pencil, Receipt, Repeat, Rocket, Search, Settings, ShoppingCart,
  Lightbulb, PawPrint, Plus, Smile, Sparkles, Sun, Sunrise, Target, Timer, Tv, Wallet, WandSparkles, Zap,
  Palette, Smartphone, Lock, Heart, MapPin, Mic, Cloud, CalendarDays, PiggyBank, Star, CircleCheck, Check, Banknote, Brain,
  Camera, Flame, Euro, FolderOpen, Pin, Folder, Trash2, Briefcase, Bell, Download, Share, Wrench, Hourglass, CircleDashed,
  Mountain, Puzzle, BicepsFlexed, Sprout, Coins, Ruler, Coffee, Leaf, PartyPopper, TriangleAlert, Moon, Library, Hand,
  Calculator, SquareCheck,
  type LucideIcon } from 'lucide-react';
import type { NavItem, WidgetId } from '../types';

/** Ein Symbol pro Bereich – in Sidebar, Bereichsleiste, Suche und Dashboard gleich */
export const PAGE_ICONS: Record<string, LucideIcon> = {
  heute: Sun,
  bereiche: LayoutGrid,
  plus: Plus,
  dashboard: House,
  kalender: Calendar,
  aufgaben: ListChecks,
  notizen: NotebookPen,
  gewohnheiten: Repeat,
  routinen: Sunrise,
  wecker: AlarmClock,
  rueckblick: Smile,
  wochenplan: CalendarRange,
  abend: MoonStar,
  ziele: Target,
  projekte: Rocket,
  training: Dumbbell,
  finanzen: Wallet,
  einkauf: ShoppingCart,
  abos: CreditCard,
  essen: UtensilsCrossed,
  menschen: Users,
  reisen: Plane,
  knubbel: PawPrint,
  licht: Lightbulb,
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

/**
 * Emojis, die früher als Symbole in der Oberfläche standen, und ihr Linien-Symbol.
 * Eigene Emojis (Gewohnheiten, Routinen, Notizen …) bleiben, wie sie sind.
 */
export const EMOJI_ICONS: Record<string, LucideIcon> = {
  '🎨': Palette, '📱': Smartphone, '📲': Download, '🔒': Lock, '❤️': Heart, '📍': MapPin, '🎙️': Mic, '☁️': Cloud,
  '🗓️': CalendarDays, '📅': Calendar, '🎓': GraduationCap, '⏱️': Timer, '⏱': Timer, '🐷': PiggyBank, '🔁': Repeat,
  '💳': CreditCard, '🎵': Music, '🧾': Receipt, '⭐': Star, '🌟': Star, '💡': Lightbulb, '📝': NotebookPen, '✅': CircleCheck,
  '✓': Check, '💸': Banknote, '🚀': Rocket, '🧠': Brain, '🏋️': Dumbbell, '📚': Library, '📖': BookOpen, '📸': Camera, '📷': Camera,
  '🛒': ShoppingCart, '🔥': Flame, '🎯': Target, '💶': Euro, '🗂️': FolderOpen, '📌': Pin, '☀️': Sun, '📁': Folder,
  '🗑️': Trash2, '💼': Briefcase, '🔔': Bell, '📤': Share, '🪄': WandSparkles, '📺': Tv, '🍽️': UtensilsCrossed, '🧰': Wrench,
  '✨': Sparkles, '🎂': Cake, '✈️': Plane, '⏳': Hourglass, '⭕': CircleDashed, '🌄': Mountain, '🧩': Puzzle, '💪': BicepsFlexed,
  '🌱': Sprout, '💰': Coins, '📏': Ruler, '☕': Coffee, '🌿': Leaf, '🎉': PartyPopper, '⚠️': TriangleAlert, '🌙': Moon,
  '⏰': AlarmClock, '⚡': Zap, '👋': Hand, '✏️': Pencil, '€': Euro, '🧮': Calculator, '☑️': SquareCheck,
};

/** Führendes Emoji eines Titels, z. B. „🎨“ aus „🎨 Design“ */
export const leadingEmoji = (text: string) => text.match(/^(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}✓€][\uFE0F\u200D]*)+/u)?.[0] ?? '';

/** Linien-Symbol zu einem Emoji (mit oder ohne Variantenzeichen) */
export const emojiIcon = (emoji: string): LucideIcon | undefined =>
  EMOJI_ICONS[emoji] ?? EMOJI_ICONS[emoji.replace(/\uFE0F/g, '')] ?? EMOJI_ICONS[`${emoji}\uFE0F`];

/** Symbol für ein Emoji: Linien-Symbol, wenn es eins gibt, sonst das Emoji selbst */
export function Sym({ emoji, size = 17 }: { emoji: string; size?: number }) {
  const Glyph = emojiIcon(emoji);
  if (Glyph) return <Icon icon={Glyph} size={size} />;
  return <span className="sym-emoji" aria-hidden>{emoji}</span>;
}

/** Entfernt ein führendes Emoji aus Titeln wie „✅ Aufgaben“ */
export const stripEmoji = (text: string) => text.replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}️‍\s]+/u, '');

/** Das neue Logo (A) */
export function Logo({ size = 26 }: { size?: number }) {
  return <img className="brand-logo" src={`${import.meta.env.BASE_URL}icons/logo-64.png`} width={size} height={size} alt="" />;
}
