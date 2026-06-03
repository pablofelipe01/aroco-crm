import type { Variants, Transition } from "framer-motion";

/** Snappy spring used for Kanban drag and interactive surfaces. */
export const spring: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 36,
  mass: 0.7,
};

/** Quick, intentional ease for page/element transitions (<200ms). */
export const ease: Transition = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1],
};

/** Container that staggers its children's reveal. */
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.045, delayChildren: 0.02 },
  },
};

/** Item that fades up into place — pair with staggerContainer. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: ease },
};

/** Simple fade for page transitions. */
export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: ease },
};

/** Slide-over panel (assistant, detail drawers). */
export const slideOver: Variants = {
  hidden: { x: "100%" },
  show: { x: 0, transition: { type: "spring", stiffness: 420, damping: 40 } },
  exit: { x: "100%", transition: ease },
};
