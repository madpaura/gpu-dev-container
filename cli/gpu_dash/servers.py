import sys
import click
from rich.console import Console
from rich.table import Table

from .api import APIClient, APIError
from .config import get_token

console = Console()


def _require_token(ctx):
    token = get_token(ctx.obj.get("token"))
    if not token:
        console.print("[red]Error:[/red] Not logged in. Run [bold]gpu-dash login[/bold] first.")
        sys.exit(1)
    return token


def _server_id(ip):
    """Convert IP to server_id format used by the API (dots → dashes)."""
    return ip.replace(".", "-")


@click.group()
def server():
    """Manage agent servers."""


@server.command("list")
@click.pass_context
def server_list(ctx):
    """List all registered agent servers."""
    token = _require_token(ctx)
    client = APIClient(token=token)
    try:
        result = client.get("/api/admin/servers")
    except APIError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)

    servers = result.get("servers", [])
    table = Table(show_header=True, header_style="bold cyan")
    for col in ("id", "name", "ip", "port", "status"):
        table.add_column(col)
    for s in servers:
        table.add_row(
            str(s.get("id", "")),
            s.get("name", ""),
            s.get("ip", s.get("host", "")),
            str(s.get("port", "")),
            s.get("status", "unknown"),
        )
    console.print(table)


@server.command("add")
@click.argument("ip")
@click.option("--port", default=8510, show_default=True, help="Agent port")
@click.option("--name", default=None, help="Server name (defaults to IP)")
@click.pass_context
def server_add(ctx, ip, port, name):
    """Register a new agent server."""
    token = _require_token(ctx)
    client = APIClient(token=token)
    try:
        result = client.post("/api/admin/servers", {
            "name": name or ip,
            "ip": ip,
            "port": port,
        })
    except APIError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)
    console.print(f"[green]Added[/green] server [bold]{ip}:{port}[/bold].")


@server.command("remove")
@click.argument("ip")
@click.option("--yes", is_flag=True, help="Skip confirmation prompt")
@click.pass_context
def server_remove(ctx, ip, yes):
    """Deregister an agent server."""
    if not yes:
        click.confirm(f"Remove server {ip}?", abort=True)
    token = _require_token(ctx)
    client = APIClient(token=token)
    try:
        client.post(f"/api/admin/servers/{_server_id(ip)}/action", {"action": "delete"})
    except APIError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)
    console.print(f"[yellow]Removed[/yellow] server [bold]{ip}[/bold].")


@server.command("status")
@click.pass_context
def server_status(ctx):
    """Show health status of all agent servers."""
    token = _require_token(ctx)
    client = APIClient(token=token)
    try:
        result = client.get("/api/admin/servers")
    except APIError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)

    servers = result.get("servers", [])
    table = Table(show_header=True, header_style="bold cyan")
    for col in ("name", "ip", "port", "status"):
        table.add_column(col)
    for s in servers:
        status = s.get("status", "unknown")
        color = "green" if status == "online" else "red"
        table.add_row(
            s.get("name", ""),
            s.get("ip", s.get("host", "")),
            str(s.get("port", "")),
            f"[{color}]{status}[/{color}]",
        )
    console.print(table)
