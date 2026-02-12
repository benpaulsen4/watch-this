import Link from "next/link";

export default function HelpNotFound() {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-6">
      <h1 className="text-xl font-semibold text-white">Guide not found</h1>
      <p className="mt-2 text-gray-300">
        This page doesn’t exist, or it was removed.
      </p>
      <Link
        href="/help"
        className="mt-4 inline-block text-red-400 hover:underline underline-offset-4"
      >
        Go back to Help Center
      </Link>
    </div>
  );
}

