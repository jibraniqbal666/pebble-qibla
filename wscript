#
# Pebble project build. Structure aligned with Muninn-style (C-D-Lewis/pebble-dev).
#
import os.path

top = '.'
out = 'build'


def options(ctx):
    ctx.load('pebble_sdk')


def configure(ctx):
    ctx.load('pebble_sdk')


def build(ctx):
    if os.path.exists('package.json'):
        ctx.exec_command('npm run build')
    ctx.load('pebble_sdk')

    build_worker = os.path.exists('worker_src')
    binaries = []
    cached_env = ctx.env

    for platform in ctx.env.TARGET_PLATFORMS:
        ctx.env = ctx.all_envs[platform]
        ctx.set_group(ctx.env.PLATFORM_NAME)
        app_elf = '{}/pebble-app.elf'.format(ctx.env.BUILD_DIR)
        ctx.pbl_program(source=ctx.path.ant_glob('src/c/**/*.c'), target=app_elf)

        if build_worker:
            worker_elf = '{}/pebble-worker.elf'.format(ctx.env.BUILD_DIR)
            binaries.append({'platform': platform, 'app_elf': app_elf, 'worker_elf': worker_elf})
            ctx.pbl_worker(source=ctx.path.ant_glob('worker_src/**/*.c'), target=worker_elf)
        else:
            binaries.append({'platform': platform, 'app_elf': app_elf})

    ctx.env = cached_env
    ctx.set_group('bundle')
    js_files = ctx.path.ant_glob('src/ts-build/**/*.js')
    ctx.pbl_bundle(binaries=binaries, js=js_files, js_entry_file='src/ts-build/index.js')
