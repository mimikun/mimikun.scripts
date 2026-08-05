"""Which pip packages were installed on purpose, rather than dragged in?

`pip freeze` flattens both into one list, which is why the file has 906 lines.
A package that nothing else in the environment requires is a root: someone
asked for it by name. Everything else arrived as a dependency and will leave
with whatever pulled it in.

Roots that also ship a console script are the ones that matter here -- those
are applications living in the shared mise python instead of in `uv tool`,
and they are what would stop being updated if the pip updaters are deleted.

Prints three sections: roots with commands, roots without, and the count of
non-roots.
"""

import re
from importlib.metadata import distributions


def canonical(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


installed: dict[str, list[str]] = {}
required_by_someone: set[str] = set()

for dist in distributions():
    name = dist.metadata["Name"]
    if name is None:
        continue
    key = canonical(name)
    commands = sorted(
        {ep.name for ep in dist.entry_points if ep.group in ("console_scripts", "gui_scripts")}
    )
    installed[key] = commands

    for requirement in dist.requires or []:
        # "foo (>=1.0) ; extra == 'bar'" -> "foo". Extras are included: an extra
        # that is not installed simply will not appear in `installed`.
        dep = re.split(r"[\s\[<>=!;(]", requirement.strip(), maxsplit=1)[0]
        if dep:
            required_by_someone.add(canonical(dep))

roots = sorted(key for key in installed if key not in required_by_someone)
with_commands = [(key, installed[key]) for key in roots if installed[key]]
without_commands = [key for key in roots if not installed[key]]

print(f"# installed distributions: {len(installed)}")
print(f"# roots: {len(roots)}  (pulled in as dependencies: {len(installed) - len(roots)})")
print(f"# roots shipping a command: {len(with_commands)}")
print()
print("## roots with commands")
for key, commands in with_commands:
    print(f"{key} :: {' '.join(commands)}")
print()
print("## roots without commands (libraries installed directly)")
print(" ".join(without_commands))
