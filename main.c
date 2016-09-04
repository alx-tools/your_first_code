
#include <stdio.h>
// insert code here...
int main()
{
    
    char gender;
    printf("Please select your gender [M/F]: ");
    gender = getchar();
    
    printf("You selected: %c", gender);
    getchar();
    getchar();
    
    
    int i;
    for (i = 0; i < 32; i++)
    {
        printf("%s Holberton\n","Hello");
    }
    return 0;
}