import { GoogleMapsSearch } from "@/components/GoogleMapsSearch";

export default function MapsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Busca Google Maps</h1>
        <p className="text-sm text-muted-foreground">Capture empresas locais via Places API.</p>
      </div>
      <GoogleMapsSearch />
    </div>
  );
}