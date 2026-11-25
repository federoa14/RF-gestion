#!/usr/bin/env python3
"""Registro de decisiones (decisiones.csv).

Uso:
  decisiones.py add "decisión" "razonamiento" "resultado esperado" [AAAA-MM-DD]
  decisiones.py check [AAAA-MM-DD]   # marca como "revision pendiente" las vencidas
  decisiones.py review               # muestra solo las marcadas
  decisiones.py done "texto"         # marca como revisada la decisión que contenga el texto

Columnas: fecha, decision, razonamiento, resultado_esperado, fecha_revision, estado
"""
import csv
import sys
from datetime import date, timedelta
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent.parent / "decisiones.csv"
COLUMNS = ["fecha", "decision", "razonamiento", "resultado_esperado", "fecha_revision", "estado"]
PENDING = "revision pendiente"
REVIEWED = "revisada"
DAYS = 30


def read_rows():
    if not CSV_PATH.exists():
        return []
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_rows(rows):
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def parse_day(s):
    return date.fromisoformat(s) if s else date.today()


def cmd_add(args):
    if len(args) < 3:
        sys.exit(__doc__)
    day = parse_day(args[3] if len(args) > 3 else None)
    rows = read_rows()
    rows.append({
        "fecha": day.isoformat(),
        "decision": args[0],
        "razonamiento": args[1],
        "resultado_esperado": args[2],
        "fecha_revision": (day + timedelta(days=DAYS)).isoformat(),
        "estado": "",
    })
    write_rows(rows)
    print(f"Registrada. Revisión: {rows[-1]['fecha_revision']}")


def cmd_check(args):
    today = parse_day(args[0] if args else None)
    rows = read_rows()
    marked = 0
    for r in rows:
        if r["estado"] == "" and date.fromisoformat(r["fecha_revision"]) <= today:
            r["estado"] = PENDING
            marked += 1
    if marked:
        write_rows(rows)
    print(f"{marked} decisión(es) marcada(s) como '{PENDING}'.")


def cmd_review(_):
    pending = [r for r in read_rows() if r["estado"] == PENDING]
    if not pending:
        print("Nada pendiente de revisión.")
        return
    for r in pending:
        print(f"[{r['fecha_revision']}] {r['decision']}")
        print(f"  Decidida el:        {r['fecha']}")
        print(f"  Razonamiento:       {r['razonamiento']}")
        print(f"  Resultado esperado: {r['resultado_esperado']}\n")


def cmd_done(args):
    if not args:
        sys.exit(__doc__)
    rows = read_rows()
    hits = [r for r in rows if args[0].lower() in r["decision"].lower() and r["estado"] == PENDING]
    if len(hits) != 1:
        sys.exit(f"Se esperaba 1 coincidencia pendiente, hay {len(hits)}.")
    hits[0]["estado"] = REVIEWED
    write_rows(rows)
    print(f"Marcada como revisada: {hits[0]['decision']}")


COMMANDS = {"add": cmd_add, "check": cmd_check, "review": cmd_review, "done": cmd_done}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    COMMANDS[sys.argv[1]](sys.argv[2:])
