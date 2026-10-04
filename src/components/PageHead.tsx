import Link from "next/link";

type Crumb = { href: string; label: string };

export default function PageHead({
  title,
  subtitle,
  crumbs,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-head intro">
      <div>
        {crumbs && crumbs.length > 0 && (
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <span key={c.href}>
                {i > 0 && " / "}
                <Link href={c.href}>{c.label}</Link>
              </span>
            ))}
          </div>
        )}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}
