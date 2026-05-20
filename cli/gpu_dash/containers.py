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
    return ip.replace(".", "-")


@click.group()
def container():
    """Manage user containers."""


@container.command("list")
@click.option("--user", "username", default=None, help="Filter by username")
@click.pass_context
def container_list(ctx, username):
    """List all user containers across all agent servers."""
    token = _require_token(ctx)
    client = APIClient(token=token)

    try:
        servers_result = client.get("/api/admin/servers")
    except APIError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)

    servers = servers_result.get("servers", [])
    table = Table(show_header=True, header_style="bold cyan")
    for col in ("server", "id", "name", "status", "cpu", "memory", "ports"):
        table.add_column(col)

    for s in servers:
        ip = s.get("ip", s.get("host", ""))
        if not ip:
            continue
        try:
            result = client.get(f"/api/admin/containers/{_server_id(ip)}")
            containers = result.get("containers", [])
        except APIError:
            console.print(f"[yellow]Warning:[/yellow] Could not reach server {ip}, skipping.")
            continue

        for c in containers:
            name = c.get("name", "")
            if username and username not in name:
                continue
            ports = ", ".join(
                f"{p.get('host_port', '')}→{p.get('container_port', '')}"
                for p in (c.get("ports") or [])
                if p.get("host_port")
            ) or "-"
            cpu = c.get("cpu_usage")
            mem = c.get("memory_usage")
            table.add_row(
                ip,
                c.get("id", "")[:12],
                name,
                c.get("status", ""),
                f"{cpu:.1f}%" if isinstance(cpu, (int, float)) else "-",
                f"{mem:.1f}%" if isinstance(mem, (int, float)) else "-",
                ports,
            )

    console.print(table)


@container.command("stop")
@click.argument("server_ip")
@click.argument("container_id")
@click.pass_context
def container_stop(ctx, server_ip, container_id):
    """Stop a container. Provide server IP and container ID."""
    token = _require_token(ctx)
    client = APIClient(token=token)
    try:
        client.post(
            f"/api/admin/containers/{_server_id(server_ip)}/{container_id}/action",
            {"action": "stop"},
        )
    except APIError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)
    console.print(f"[yellow]Stopped[/yellow] container [bold]{container_id}[/bold] on {server_ip}.")


@container.command("restart")
@click.argument("server_ip")
@click.argument("container_id")
@click.pass_context
def container_restart(ctx, server_ip, container_id):
    """Restart a container. Provide server IP and container ID."""
    token = _require_token(ctx)
    client = APIClient(token=token)
    try:
        client.post(
            f"/api/admin/containers/{_server_id(server_ip)}/{container_id}/action",
            {"action": "restart"},
        )
    except APIError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)
    console.print(f"[green]Restarted[/green] container [bold]{container_id}[/bold] on {server_ip}.")
