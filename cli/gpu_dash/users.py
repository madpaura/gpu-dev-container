import sys
import click
from rich.console import Console
from rich.table import Table

from .api import APIClient, APIError
from .config import get_token

console = Console()

VALID_TYPES = ("regular", "qvp", "admin")


def _require_token(ctx):
    token = get_token(ctx.obj.get("token"))
    if not token:
        console.print("[red]Error:[/red] Not logged in. Run [bold]gpu-dash login[/bold] first.")
        sys.exit(1)
    return token


@click.group()
def user():
    """Manage users."""


@user.command("list")
@click.pass_context
def user_list(ctx):
    """List all users."""
    token = _require_token(ctx)
    client = APIClient(token=token)
    try:
        result = client.get("/api/admin/users")
    except APIError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)

    users = result.get("users", [])
    table = Table(show_header=True, header_style="bold cyan")
    for col in ("id", "username", "email", "user_type", "status"):
        table.add_column(col)
    for u in users:
        table.add_row(
            str(u.get("id", "")),
            u.get("username", ""),
            u.get("email", ""),
            u.get("user_type", ""),
            u.get("status", ""),
        )
    console.print(table)


@user.command("create")
@click.argument("username")
@click.option("--email", prompt="Email")
@click.option("--password", prompt="Password", hide_input=True, confirmation_prompt=True)
@click.option("--type", "user_type", prompt="User type (regular/qvp/admin)", default="regular")
@click.pass_context
def user_create(ctx, username, email, password, user_type):
    """Create a new user."""
    if user_type not in VALID_TYPES:
        console.print(f"[red]Error:[/red] Invalid type '{user_type}'. Choose from: {', '.join(VALID_TYPES)}")
        sys.exit(1)
    token = _require_token(ctx)
    client = APIClient(token=token)
    try:
        result = client.post("/api/admin/users", {
            "username": username,
            "email": email,
            "password": password,
            "user_type": user_type,
        })
    except APIError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)
    console.print(f"[green]Created[/green] user [bold]{username}[/bold].")


@user.command("approve")
@click.argument("username")
@click.pass_context
def user_approve(ctx, username):
    """Approve a pending user."""
    token = _require_token(ctx)
    client = APIClient(token=token)
    try:
        users_result = client.get("/api/admin/users")
        users = users_result.get("users", [])
        match = next((u for u in users if u.get("username") == username), None)
        if not match:
            console.print(f"[red]Error:[/red] User '{username}' not found.")
            sys.exit(1)
        client.post(f"/api/admin/users/{match['id']}/approve", {})
    except APIError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)
    console.print(f"[green]Approved[/green] user [bold]{username}[/bold].")


@user.command("suspend")
@click.argument("username")
@click.pass_context
def user_suspend(ctx, username):
    """Suspend a user (sets status to inactive)."""
    token = _require_token(ctx)
    client = APIClient(token=token)
    try:
        users_result = client.get("/api/admin/users")
        users = users_result.get("users", [])
        match = next((u for u in users if u.get("username") == username), None)
        if not match:
            console.print(f"[red]Error:[/red] User '{username}' not found.")
            sys.exit(1)
        if match.get("status") == "suspended":
            console.print(f"[yellow]Warning:[/yellow] User '{username}' is already suspended.")
            sys.exit(1)
        client.put(f"/api/admin/users/{match['id']}", {"status": "suspended"})
    except APIError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)
    console.print(f"[yellow]Suspended[/yellow] user [bold]{username}[/bold].")


@user.command("set-type")
@click.argument("username")
@click.argument("user_type")
@click.pass_context
def user_set_type(ctx, username, user_type):
    """Set user type (regular, qvp, admin)."""
    if user_type not in VALID_TYPES:
        console.print(f"[red]Error:[/red] Invalid type '{user_type}'. Choose from: {', '.join(VALID_TYPES)}")
        sys.exit(1)
    token = _require_token(ctx)
    client = APIClient(token=token)
    try:
        users_result = client.get("/api/admin/users")
        users = users_result.get("users", [])
        match = next((u for u in users if u.get("username") == username), None)
        if not match:
            console.print(f"[red]Error:[/red] User '{username}' not found.")
            sys.exit(1)
        client.put(f"/api/admin/users/{match['id']}", {"role": user_type})
    except APIError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)
    console.print(f"[green]Updated[/green] [bold]{username}[/bold] type to [bold]{user_type}[/bold].")
