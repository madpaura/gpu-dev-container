from setuptools import setup, find_packages

setup(
    name="gpu-dash",
    version="0.1.0",
    packages=find_packages(),
    install_requires=["click>=8.0", "rich>=13.0", "requests>=2.28"],
    entry_points={"console_scripts": ["gpu-dash=gpu_dash.main:cli"]},
)
