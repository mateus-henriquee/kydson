import type { CSSProperties, ElementType, ReactNode } from "react";
import { useReveal } from "../hooks/useReveal";

interface Props {
  as?: ElementType;
  delay?: number;
  className?: string;
  children: ReactNode;
}

export function Reveal({ as: Tag = "div", delay = 0, className = "", children }: Props) {
  const { ref, shown } = useReveal<HTMLElement>();
  const style = { "--d": `${delay}ms` } as CSSProperties;
  return (
    <Tag ref={ref} style={style} className={`reveal ${shown ? "is-in" : ""} ${className}`}>
      {children}
    </Tag>
  );
}
