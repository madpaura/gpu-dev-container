import click
from .auth import login, logout, whoami
from .users import user
from .servers import server
from .containers import container


@click.group()
@click.option("--token", envvar="GPU_DASH_TOKEN", default=None, hidden=True)
@click.pass_context
def cli(ctx, token):
    """gpu-dash — GPU Dev Container management CLI."""
    ctx.ensure_object(dict)
    ctx.obj["token"] = token


cli.add_command(login)
cli.add_command(logout)
cli.add_command(whoami)
cli.add_command(user)
cli.add_command(server)
cli.add_command(container)
