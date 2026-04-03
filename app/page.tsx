import HomePageClient from "./home-client";

/** Серверный entry для `/`: всегда 200 + HTML-оболочка (healthcheck / Railway). */
export default function HomePage() {
  return <HomePageClient />;
}
