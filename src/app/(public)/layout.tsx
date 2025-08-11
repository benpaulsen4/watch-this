export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-950">
      <main className="container mx-auto">
        {children}
      </main>
    </div>
  );
}