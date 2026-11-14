import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Flag, TrendingUp } from "lucide-react";

import heroImage from "@/assets/camino-objetivo.jpg";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rumbo — Un gran objetivo, paso a paso" },
      {
        name: "description",
        content:
          "Define tu objetivo principal, divídelo en metas semanales y mensuales y mira tu progreso crecer.",
      },
      { property: "og:title", content: "Rumbo — Un gran objetivo, paso a paso" },
      {
        property: "og:description",
        content: "Divide tu objetivo principal en metas semanales y mensuales y sigue tu avance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const steps = [
  {
    icon: Flag,
    title: "Define tu meta principal",
    text: "Lo grande que quieres lograr, con una fecha para llegar.",
  },
  {
    icon: CalendarDays,
    title: "Divídela en pasos",
    text: "Metas semanales y mensuales que te acercan cada día.",
  },
  {
    icon: TrendingUp,
    title: "Mira tu avance",
    text: "Cada paso cumplido llena tu barra de progreso.",
  },
];

function Index() {
  const session = useSession();
  const signedIn = !!session;

  return (
    <div className="min-h-screen bg-background">
      <section className="relative isolate overflow-hidden">
        <img
          src={heroImage}
          alt="Camino de piedras que sube hacia la cima de una montaña con una bandera"
          width={1024}
          height={1280}
          className="absolute inset-0 -z-10 h-full w-full object-cover object-bottom"
        />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-background to-transparent" />

        <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <Logo />
          {session !== undefined &&
            (signedIn ? (
              <Button asChild variant="light" size="sm">
                <Link to="/objetivos">Mis objetivos</Link>
              </Button>
            ) : (
              <Button asChild variant="light" size="sm">
                <Link to="/auth">Iniciar sesión</Link>
              </Button>
            ))}
        </header>

        <div className="mx-auto max-w-5xl px-5 pb-[22rem] pt-10 sm:pb-[28rem] sm:pt-16">
          <p className="animate-rise text-sm font-semibold uppercase tracking-[0.2em] text-primary">
            Tu camino a la cima
          </p>
          <h1 className="animate-rise mt-3 max-w-xl text-5xl font-extrabold leading-[1.02] text-foreground sm:text-6xl">
            Un gran objetivo, paso a paso.
          </h1>
          <p className="animate-rise mt-4 max-w-md text-lg text-foreground/80">
            Elige lo que quieres lograr y divídelo en metas semanales y mensuales que sí puedes
            cumplir.
          </p>
          <div className="animate-rise mt-7">
            <Button asChild variant="hero" size="lg">
              <Link to="/objetivos">
                {signedIn ? "Ver mis objetivos" : "Empezar ahora"}
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-20">
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="rounded-2xl border bg-card p-5 shadow-soft">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                  <step.icon className="size-5" />
                </span>
                <span className="font-display text-sm font-semibold text-muted-foreground">
                  Paso {i + 1}
                </span>
              </div>
              <h2 className="mt-4 text-lg font-bold">{step.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
