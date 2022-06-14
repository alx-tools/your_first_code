int main()
{
  int i;
  for (i = 0; i < 10; i++)
    fork()
  {
    printf("School\n");
  }
  return 0;
}
