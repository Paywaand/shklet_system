import { redirect } from "next/navigation";

// Root simply forwards to the POS screen (middleware enforces auth).
export default function Home() {
  redirect("/pos");
}
