import './styles.css';
export const metadata = { title: 'DevTask — Workspace', description: 'Project and task management for teams' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
