import Link from "next/link";
import styles from "./history.module.css";

const items = [
  { href: "/sessions", label: "Sessions" },
  { href: "/warnings", label: "Warnings" },
  { href: "/storage", label: "History & storage" },
] as const;

export function HistoryNavigation({ active }: { active: (typeof items)[number]["href"] }) {
  return (
    <nav className={styles.areaNav} aria-label="Sample history">
      {items.map((item) => (
        <Link
          aria-current={active === item.href ? "page" : undefined}
          className={
            active === item.href ? styles.selected + " " + styles.areaNavLink : styles.areaNavLink
          }
          href={item.href}
          key={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function SampleLabel() {
  return <span className="fixture-label">Sample only · saved in this browser</span>;
}
